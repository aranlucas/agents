// Package groceries owns household and shared grocery-list persistence.
package groceries

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"agents/internal/cloudflare"
)

var (
	ErrNotFound        = errors.New("grocery resource not found")
	ErrForbidden       = errors.New("grocery resource forbidden")
	ErrInviteExpired   = errors.New("household invite expired")
	ErrInviteExhausted = errors.New("household invite exhausted")
	ErrInvalid         = errors.New("invalid grocery input")
)

const (
	defaultQuantity = "1"
	maxBatchItems   = 200
)

type Household struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	CreatedBy string `json:"created_by"`
	CreatedAt int64  `json:"created_at"`
}

type Invite struct {
	Code        string `json:"code"`
	HouseholdID string `json:"household_id"`
	CreatedBy   string `json:"created_by"`
	ExpiresAt   int64  `json:"expires_at"`
	MaxUses     int    `json:"max_uses"`
	UsedCount   int    `json:"used_count"`
}

type List struct {
	ID          string  `json:"id"`
	HouseholdID *string `json:"household_id"`
	OwnerUserID string  `json:"owner_user_id"`
	Title       string  `json:"title"`
	Status      string  `json:"status"`
	CreatedAt   int64   `json:"created_at"`
	UpdatedAt   int64   `json:"updated_at"`
	Items       []Item  `json:"items"`
}

type Item struct {
	ID        string  `json:"id"`
	ListID    string  `json:"list_id"`
	Name      string  `json:"name"`
	Quantity  string  `json:"quantity"`
	Note      *string `json:"note"`
	Position  int     `json:"position"`
	AddedBy   string  `json:"added_by"`
	CheckedBy *string `json:"checked_by"`
	CheckedAt *int64  `json:"checked_at"`
	UpdatedAt int64   `json:"updated_at"`
}

type NewItem struct {
	Name     string  `json:"name"`
	Quantity string  `json:"quantity"`
	Note     *string `json:"note,omitempty"`
}

type ItemPatch struct {
	Name     *string `json:"name,omitempty"`
	Quantity *string `json:"quantity,omitempty"`
	Note     *string `json:"note,omitempty"`
	Checked  *bool   `json:"checked,omitempty"`
}

type Repository interface {
	CreateHousehold(context.Context, string, string, time.Time) (Household, error)
	ListHouseholds(context.Context, string) ([]Household, error)
	IsMember(context.Context, string, string) (bool, error)
	IsOwner(context.Context, string, string) (bool, error)
	CreateInvite(context.Context, string, string, string, int, time.Time) (Invite, error)
	JoinHousehold(context.Context, string, string, time.Time) (Household, error)
	CanAccessList(context.Context, string, string) (bool, error)
	CreateList(context.Context, string, *string, string, time.Time) (List, error)
	ListLists(context.Context, string, string) ([]List, error)
	GetList(context.Context, string, string) (List, error)
	AddItems(context.Context, string, string, []NewItem, time.Time) ([]Item, error)
	UpdateItem(context.Context, string, string, string, ItemPatch, time.Time) (Item, error)
	DeleteItem(context.Context, string, string, string) error
}

type statementRunner interface {
	Run(context.Context, ...cloudflare.Statement) ([]cloudflare.Result, error)
}

type Store struct {
	d1    statementRunner
	newID func(string) (string, error)
}

func NewStore(d1 *cloudflare.D1) *Store {
	return &Store{d1: d1, newID: randomID}
}

func (s *Store) CreateHousehold(ctx context.Context, userID, name string, now time.Time) (Household, error) {
	if err := s.ready(); err != nil {
		return Household{}, err
	}
	userID, name = strings.TrimSpace(userID), strings.TrimSpace(name)
	if userID == "" || name == "" || len(name) > 120 {
		return Household{}, ErrInvalid
	}
	id, err := s.newID("hh")
	if err != nil {
		return Household{}, err
	}
	createdAt := timestamp(now)
	_, err = s.d1.Run(
		ctx,
		cloudflare.Statement{SQL: `INSERT INTO households (id, name, created_by, created_at) VALUES (?, ?, ?, ?)`, Params: []any{id, name, userID, createdAt}},
		cloudflare.Statement{SQL: `INSERT INTO household_members (household_id, clerk_user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`, Params: []any{id, userID, createdAt}},
	)
	if err != nil {
		return Household{}, fmt.Errorf("create household: %w", err)
	}
	return Household{ID: id, Name: name, Role: "owner", CreatedBy: userID, CreatedAt: createdAt}, nil
}

func (s *Store) ListHouseholds(ctx context.Context, userID string) ([]Household, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return nil, ErrInvalid
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `SELECT h.id, h.name, hm.role, h.created_by, h.created_at
		      FROM household_members hm JOIN households h ON h.id = hm.household_id
		      WHERE hm.clerk_user_id = ? ORDER BY h.created_at, h.id`,
		Params: []any{userID},
	})
	if err != nil {
		return nil, fmt.Errorf("list households: %w", err)
	}
	households := []Household{}
	if len(results) == 0 {
		return households, nil
	}
	for _, raw := range results[0].Rows {
		var household Household
		if json.Unmarshal(raw, &household) != nil || household.ID == "" || household.Name == "" {
			return nil, errors.New("decode household")
		}
		households = append(households, household)
	}
	return households, nil
}

func (s *Store) IsMember(ctx context.Context, userID, householdID string) (bool, error) {
	return s.hasRow(ctx, `SELECT 1 AS present FROM household_members WHERE household_id = ? AND clerk_user_id = ? LIMIT 1`, householdID, userID)
}

func (s *Store) IsOwner(ctx context.Context, userID, householdID string) (bool, error) {
	return s.hasRow(ctx, `SELECT 1 AS present FROM household_members WHERE household_id = ? AND clerk_user_id = ? AND role = 'owner' LIMIT 1`, householdID, userID)
}

func (s *Store) CreateInvite(ctx context.Context, userID, householdID, code string, maxUses int, now time.Time) (Invite, error) {
	if err := s.ready(); err != nil {
		return Invite{}, err
	}
	userID, householdID, code = strings.TrimSpace(userID), strings.TrimSpace(householdID), strings.ToUpper(strings.TrimSpace(code))
	if userID == "" || householdID == "" || len(code) != 8 || maxUses < 1 || maxUses > 100 {
		return Invite{}, ErrInvalid
	}
	createdAt := timestamp(now)
	expiresAt := createdAt + int64((7*24*time.Hour)/time.Millisecond)
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `INSERT INTO household_invites (code, household_id, created_by, expires_at, max_uses, used_count)
		      SELECT ?, ?, ?, ?, ?, 0 FROM household_members
		      WHERE household_id = ? AND clerk_user_id = ? AND role = 'owner'`,
		Params: []any{code, householdID, userID, expiresAt, maxUses, householdID, userID},
	})
	if err != nil {
		return Invite{}, fmt.Errorf("create household invite: %w", err)
	}
	if changed(results) == 0 {
		return Invite{}, ErrForbidden
	}
	return Invite{Code: code, HouseholdID: householdID, CreatedBy: userID, ExpiresAt: expiresAt, MaxUses: maxUses}, nil
}

func (s *Store) JoinHousehold(ctx context.Context, userID, code string, now time.Time) (Household, error) {
	if err := s.ready(); err != nil {
		return Household{}, err
	}
	userID, code = strings.TrimSpace(userID), strings.ToUpper(strings.TrimSpace(code))
	if userID == "" || len(code) != 8 {
		return Household{}, ErrInvalid
	}
	nowMillis := timestamp(now)
	lookup, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `SELECT h.id, h.name, h.created_by, h.created_at, i.expires_at, i.max_uses, i.used_count,
		             EXISTS(SELECT 1 FROM household_members hm WHERE hm.household_id = h.id AND hm.clerk_user_id = ?) AS already_member
		      FROM household_invites i JOIN households h ON h.id = i.household_id WHERE i.code = ? LIMIT 1`,
		Params: []any{userID, code},
	})
	if err != nil {
		return Household{}, fmt.Errorf("load household invite: %w", err)
	}
	if len(lookup) == 0 || len(lookup[0].Rows) == 0 {
		return Household{}, ErrNotFound
	}
	var row struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		CreatedBy     string `json:"created_by"`
		CreatedAt     int64  `json:"created_at"`
		ExpiresAt     int64  `json:"expires_at"`
		MaxUses       int    `json:"max_uses"`
		UsedCount     int    `json:"used_count"`
		AlreadyMember int    `json:"already_member"`
	}
	if json.Unmarshal(lookup[0].Rows[0], &row) != nil || row.ID == "" {
		return Household{}, errors.New("decode household invite")
	}
	household := Household{ID: row.ID, Name: row.Name, Role: "member", CreatedBy: row.CreatedBy, CreatedAt: row.CreatedAt}
	if row.AlreadyMember != 0 {
		return household, nil
	}
	if row.ExpiresAt < nowMillis {
		return Household{}, ErrInviteExpired
	}
	if row.UsedCount >= row.MaxUses {
		return Household{}, ErrInviteExhausted
	}
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: `INSERT OR IGNORE INTO household_members (household_id, clerk_user_id, role, joined_at)
			      SELECT household_id, ?, 'member', ? FROM household_invites
			      WHERE code = ? AND expires_at >= ? AND used_count < max_uses`,
			Params: []any{userID, nowMillis, code, nowMillis},
		},
		cloudflare.Statement{
			SQL: `UPDATE household_invites SET used_count = used_count + 1
			      WHERE code = ? AND used_count < max_uses AND EXISTS (
			        SELECT 1 FROM household_members WHERE household_id = household_invites.household_id
			        AND clerk_user_id = ? AND joined_at = ?
			      )`,
			Params: []any{code, userID, nowMillis},
		},
	)
	if err != nil {
		return Household{}, fmt.Errorf("join household: %w", err)
	}
	if len(results) == 0 || results[0].Meta.Changes == 0 {
		return Household{}, ErrInviteExhausted
	}
	return household, nil
}

func (s *Store) CanAccessList(ctx context.Context, userID, listID string) (bool, error) {
	return s.hasRow(ctx, `SELECT 1 AS present FROM grocery_lists gl
		WHERE gl.id = ? AND (gl.owner_user_id = ? OR EXISTS (
		  SELECT 1 FROM household_members hm WHERE hm.household_id = gl.household_id AND hm.clerk_user_id = ?
		)) LIMIT 1`, listID, userID, userID)
}

func (s *Store) CreateList(ctx context.Context, userID string, householdID *string, title string, now time.Time) (List, error) {
	if err := s.ready(); err != nil {
		return List{}, err
	}
	userID, title = strings.TrimSpace(userID), strings.TrimSpace(title)
	if userID == "" || title == "" || len(title) > 120 {
		return List{}, ErrInvalid
	}
	var household any
	if householdID != nil {
		trimmed := strings.TrimSpace(*householdID)
		if trimmed == "" {
			return List{}, ErrInvalid
		}
		householdID = &trimmed
		household = trimmed
	}
	id, err := s.newID("list")
	if err != nil {
		return List{}, err
	}
	createdAt := timestamp(now)
	statement := cloudflare.Statement{
		SQL: `INSERT INTO grocery_lists (id, household_id, owner_user_id, title, status, created_at, updated_at)
		      SELECT ?, ?, ?, ?, 'active', ?, ? WHERE ? IS NULL OR EXISTS (
		        SELECT 1 FROM household_members WHERE household_id = ? AND clerk_user_id = ?
		      )`,
		Params: []any{id, household, userID, title, createdAt, createdAt, household, household, userID},
	}
	results, err := s.d1.Run(ctx, statement)
	if err != nil {
		return List{}, fmt.Errorf("create grocery list: %w", err)
	}
	if changed(results) == 0 {
		return List{}, ErrForbidden
	}
	return List{ID: id, HouseholdID: householdID, OwnerUserID: userID, Title: title, Status: "active", CreatedAt: createdAt, UpdatedAt: createdAt, Items: []Item{}}, nil
}

func (s *Store) ListLists(ctx context.Context, userID, householdID string) ([]List, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	userID, householdID = strings.TrimSpace(userID), strings.TrimSpace(householdID)
	if userID == "" || householdID == "" {
		return nil, ErrInvalid
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `SELECT gl.id, gl.household_id, gl.owner_user_id, gl.title, gl.status, gl.created_at, gl.updated_at
		      FROM grocery_lists gl WHERE gl.household_id = ? AND EXISTS (
		        SELECT 1 FROM household_members hm WHERE hm.household_id = gl.household_id AND hm.clerk_user_id = ?
		      ) ORDER BY gl.updated_at DESC, gl.id`,
		Params: []any{householdID, userID},
	})
	if err != nil {
		return nil, fmt.Errorf("list grocery lists: %w", err)
	}
	lists := []List{}
	if len(results) == 0 {
		return lists, nil
	}
	for _, raw := range results[0].Rows {
		list, decodeErr := decodeList(raw)
		if decodeErr != nil {
			return nil, decodeErr
		}
		list.Items = []Item{}
		lists = append(lists, list)
	}
	return lists, nil
}

func (s *Store) GetList(ctx context.Context, userID, listID string) (List, error) {
	if err := s.ready(); err != nil {
		return List{}, err
	}
	userID, listID = strings.TrimSpace(userID), strings.TrimSpace(listID)
	if userID == "" || listID == "" {
		return List{}, ErrInvalid
	}
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: `SELECT gl.id, gl.household_id, gl.owner_user_id, gl.title, gl.status, gl.created_at, gl.updated_at
			      FROM grocery_lists gl WHERE gl.id = ? AND (gl.owner_user_id = ? OR EXISTS (
			        SELECT 1 FROM household_members hm WHERE hm.household_id = gl.household_id AND hm.clerk_user_id = ?
			      )) LIMIT 1`,
			Params: []any{listID, userID, userID},
		},
		cloudflare.Statement{
			SQL: `SELECT id, list_id, name, quantity, note, position, added_by, checked_by, checked_at, updated_at
			      FROM grocery_list_items WHERE list_id = ? ORDER BY position, id`,
			Params: []any{listID},
		},
	)
	if err != nil {
		return List{}, fmt.Errorf("load grocery list: %w", err)
	}
	if len(results) == 0 || len(results[0].Rows) == 0 {
		return List{}, ErrNotFound
	}
	list, err := decodeList(results[0].Rows[0])
	if err != nil {
		return List{}, err
	}
	list.Items = []Item{}
	if len(results) > 1 {
		for _, raw := range results[1].Rows {
			item, decodeErr := decodeItem(raw)
			if decodeErr != nil {
				return List{}, decodeErr
			}
			list.Items = append(list.Items, item)
		}
	}
	return list, nil
}

func (s *Store) AddItems(ctx context.Context, userID, listID string, inputs []NewItem, now time.Time) ([]Item, error) {
	if err := s.ready(); err != nil {
		return nil, err
	}
	userID, listID = strings.TrimSpace(userID), strings.TrimSpace(listID)
	if userID == "" || listID == "" || len(inputs) == 0 || len(inputs) > maxBatchItems {
		return nil, ErrInvalid
	}
	updatedAt := timestamp(now)
	statements := make([]cloudflare.Statement, 0, len(inputs)+1)
	items := make([]Item, 0, len(inputs))
	for _, input := range inputs {
		name, quantity := strings.TrimSpace(input.Name), strings.TrimSpace(input.Quantity)
		if quantity == "" {
			quantity = defaultQuantity
		}
		if name == "" || len(name) > 500 || len(quantity) > 100 || (input.Note != nil && len(*input.Note) > 1000) {
			return nil, ErrInvalid
		}
		id, err := s.newID("item")
		if err != nil {
			return nil, err
		}
		var note any
		if input.Note != nil && strings.TrimSpace(*input.Note) != "" {
			trimmed := strings.TrimSpace(*input.Note)
			note = trimmed
		}
		statements = append(statements, cloudflare.Statement{
			SQL: `INSERT INTO grocery_list_items (id, list_id, name, quantity, note, position, added_by, checked_by, checked_at, updated_at)
			      SELECT ?, gl.id, ?, ?, ?, COALESCE((SELECT MAX(position) + 1 FROM grocery_list_items WHERE list_id = gl.id), 0), ?, NULL, NULL, ?
			      FROM grocery_lists gl WHERE gl.id = ? AND (gl.owner_user_id = ? OR EXISTS (
			        SELECT 1 FROM household_members hm WHERE hm.household_id = gl.household_id AND hm.clerk_user_id = ?
			      ))`,
			Params: []any{id, name, quantity, note, userID, updatedAt, listID, userID, userID},
		})
		items = append(items, Item{ID: id, ListID: listID, Name: name, Quantity: quantity, Note: stringPointer(note), AddedBy: userID, UpdatedAt: updatedAt})
	}
	statements = append(statements, cloudflare.Statement{
		SQL: `UPDATE grocery_lists SET updated_at = ? WHERE id = ? AND (owner_user_id = ? OR EXISTS (
		      SELECT 1 FROM household_members hm WHERE hm.household_id = grocery_lists.household_id AND hm.clerk_user_id = ?
		    ))`,
		Params: []any{updatedAt, listID, userID, userID},
	})
	results, err := s.d1.Run(ctx, statements...)
	if err != nil {
		return nil, fmt.Errorf("add grocery list items: %w", err)
	}
	for index := range inputs {
		if index >= len(results) || results[index].Meta.Changes == 0 {
			return nil, ErrForbidden
		}
		items[index].Position = index
	}
	return items, nil
}

func (s *Store) UpdateItem(ctx context.Context, userID, listID, itemID string, patch ItemPatch, now time.Time) (Item, error) {
	if err := s.ready(); err != nil {
		return Item{}, err
	}
	userID, listID, itemID = strings.TrimSpace(userID), strings.TrimSpace(listID), strings.TrimSpace(itemID)
	if userID == "" || listID == "" || itemID == "" {
		return Item{}, ErrInvalid
	}
	sets := []string{}
	params := []any{}
	if patch.Name != nil {
		value := strings.TrimSpace(*patch.Name)
		if value == "" || len(value) > 500 {
			return Item{}, ErrInvalid
		}
		sets, params = append(sets, "name = ?"), append(params, value)
	}
	if patch.Quantity != nil {
		value := strings.TrimSpace(*patch.Quantity)
		if value == "" || len(value) > 100 {
			return Item{}, ErrInvalid
		}
		sets, params = append(sets, "quantity = ?"), append(params, value)
	}
	if patch.Note != nil {
		value := strings.TrimSpace(*patch.Note)
		if len(value) > 1000 {
			return Item{}, ErrInvalid
		}
		if value == "" {
			sets = append(sets, "note = NULL")
		} else {
			sets, params = append(sets, "note = ?"), append(params, value)
		}
	}
	updatedAt := timestamp(now)
	if patch.Checked != nil {
		if *patch.Checked {
			sets, params = append(sets, "checked_by = ?", "checked_at = ?"), append(params, userID, updatedAt)
		} else {
			sets = append(sets, "checked_by = NULL", "checked_at = NULL")
		}
	}
	if len(sets) == 0 {
		return Item{}, ErrInvalid
	}
	sets, params = append(sets, "updated_at = ?"), append(params, updatedAt)
	params = append(params, itemID, listID, userID, userID)
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: `UPDATE grocery_list_items SET ` + strings.Join(sets, ", ") + ` WHERE id = ? AND list_id = ? AND EXISTS (
			      SELECT 1 FROM grocery_lists gl WHERE gl.id = grocery_list_items.list_id AND (gl.owner_user_id = ? OR EXISTS (
			        SELECT 1 FROM household_members hm WHERE hm.household_id = gl.household_id AND hm.clerk_user_id = ?
			      )))`,
			Params: params,
		},
		cloudflare.Statement{
			SQL: `SELECT id, list_id, name, quantity, note, position, added_by, checked_by, checked_at, updated_at
			      FROM grocery_list_items WHERE id = ? AND list_id = ?`,
			Params: []any{itemID, listID},
		},
		cloudflare.Statement{SQL: `UPDATE grocery_lists SET updated_at = ? WHERE id = ?`, Params: []any{updatedAt, listID}},
	)
	if err != nil {
		return Item{}, fmt.Errorf("update grocery list item: %w", err)
	}
	if len(results) < 2 || results[0].Meta.Changes == 0 || len(results[1].Rows) == 0 {
		return Item{}, ErrNotFound
	}
	return decodeItem(results[1].Rows[0])
}

func (s *Store) DeleteItem(ctx context.Context, userID, listID, itemID string) error {
	if err := s.ready(); err != nil {
		return err
	}
	userID, listID, itemID = strings.TrimSpace(userID), strings.TrimSpace(listID), strings.TrimSpace(itemID)
	if userID == "" || listID == "" || itemID == "" {
		return ErrInvalid
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `DELETE FROM grocery_list_items WHERE id = ? AND list_id = ? AND EXISTS (
		      SELECT 1 FROM grocery_lists gl WHERE gl.id = grocery_list_items.list_id AND (gl.owner_user_id = ? OR EXISTS (
		        SELECT 1 FROM household_members hm WHERE hm.household_id = gl.household_id AND hm.clerk_user_id = ?
		      )))`,
		Params: []any{itemID, listID, userID, userID},
	})
	if err != nil {
		return fmt.Errorf("delete grocery list item: %w", err)
	}
	if changed(results) == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) ready() error {
	if s == nil || s.d1 == nil || s.newID == nil {
		return errors.New("grocery store is required")
	}
	return nil
}

func (s *Store) hasRow(ctx context.Context, sql string, values ...string) (bool, error) {
	if err := s.ready(); err != nil {
		return false, err
	}
	params := make([]any, len(values))
	for index, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			return false, ErrInvalid
		}
		params[index] = value
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{SQL: sql, Params: params})
	if err != nil {
		return false, err
	}
	return len(results) > 0 && len(results[0].Rows) > 0, nil
}

func decodeList(raw json.RawMessage) (List, error) {
	var list List
	if json.Unmarshal(raw, &list) != nil || list.ID == "" || list.Title == "" || list.OwnerUserID == "" {
		return List{}, errors.New("decode grocery list")
	}
	return list, nil
}

func decodeItem(raw json.RawMessage) (Item, error) {
	var item Item
	if json.Unmarshal(raw, &item) != nil || item.ID == "" || item.ListID == "" || item.Name == "" || item.Quantity == "" {
		return Item{}, errors.New("decode grocery list item")
	}
	return item, nil
}

func changed(results []cloudflare.Result) int64 {
	if len(results) == 0 {
		return 0
	}
	return results[0].Meta.Changes
}

func timestamp(now time.Time) int64 {
	if now.IsZero() {
		now = time.Now()
	}
	return now.UTC().UnixMilli()
}

func randomID(prefix string) (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", errors.New("generate grocery identifier")
	}
	return prefix + "_" + hex.EncodeToString(bytes), nil
}

func stringPointer(value any) *string {
	text, ok := value.(string)
	if !ok {
		return nil
	}
	return &text
}
