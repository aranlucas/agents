package groceries

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"agents/internal/cloudflare"
)

const (
	shoppingProfileArtifactName = "shopping-profile.json"
	shoppingProfileResourceType = "shopping_profile"
)

type PantryItem struct {
	Name      string  `json:"name"`
	Quantity  float64 `json:"quantity"`
	AddedAt   int64   `json:"added_at"`
	ExpiresAt *int64  `json:"expires_at,omitempty"`
}

type EquipmentItem struct {
	Name     string  `json:"name"`
	Category *string `json:"category,omitempty"`
	AddedAt  int64   `json:"added_at"`
}

type OrderItem struct {
	UPC      string   `json:"upc"`
	Name     string   `json:"name"`
	Quantity int      `json:"quantity"`
	Price    *float64 `json:"price,omitempty"`
}

type Order struct {
	ID             string      `json:"id"`
	Items          []OrderItem `json:"items"`
	TotalItems     int         `json:"total_items"`
	EstimatedTotal *float64    `json:"estimated_total,omitempty"`
	PlacedAt       int64       `json:"placed_at"`
	LocationID     *string     `json:"location_id,omitempty"`
	Notes          *string     `json:"notes,omitempty"`
}

type PreferredStore struct {
	LocationID string `json:"location_id"`
	Name       string `json:"name"`
	Address    string `json:"address"`
	Chain      string `json:"chain"`
	SetAt      int64  `json:"set_at"`
}

type FrequentItem struct {
	Name          string `json:"name"`
	UPC           string `json:"upc"`
	Orders        int    `json:"orders"`
	TotalQuantity int    `json:"total_quantity"`
}

type ShoppingProfile struct {
	PreferredStore *PreferredStore `json:"preferred_store,omitempty"`
	Pantry         []PantryItem    `json:"pantry"`
	Equipment      []EquipmentItem `json:"equipment"`
	RecentOrders   []Order         `json:"recent_orders"`
	FrequentItems  []FrequentItem  `json:"frequent_items"`
}

type ShoppingRepository interface {
	Pantry(ctx context.Context, userID string) ([]PantryItem, error)
	AddPantryItems(ctx context.Context, userID string, items []PantryItem, now time.Time) ([]PantryItem, error)
	RemovePantryItems(ctx context.Context, userID string, names []string) ([]PantryItem, error)
	SetPantryQuantity(ctx context.Context, userID, name string, quantity float64) ([]PantryItem, error)
	ClearPantry(ctx context.Context, userID string) error
	Equipment(ctx context.Context, userID string) ([]EquipmentItem, error)
	AddEquipment(ctx context.Context, userID string, items []EquipmentItem, now time.Time) ([]EquipmentItem, error)
	RemoveEquipment(ctx context.Context, userID string, names []string) ([]EquipmentItem, error)
	ClearEquipment(ctx context.Context, userID string) error
	RecordOrder(ctx context.Context, userID string, order Order, now time.Time) (Order, error)
	RecentOrders(ctx context.Context, userID string, limit int) ([]Order, error)
	PreferredStore(ctx context.Context, userID string) (*PreferredStore, error)
	SetPreferredStore(ctx context.Context, userID string, store PreferredStore, now time.Time) (PreferredStore, error)
	ClearPreferredStore(ctx context.Context, userID string) error
	ShoppingProfile(ctx context.Context, userID string) (ShoppingProfile, error)
	ResolveShopper(ctx context.Context, krogerSub string) (string, error)
	LinkKrogerAccount(ctx context.Context, krogerSub, clerkUserID string, now time.Time) error
}

var _ ShoppingRepository = (*Store)(nil)

func (s *Store) Pantry(ctx context.Context, userID string) ([]PantryItem, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL:    `SELECT name, quantity, added_at, expires_at FROM pantry_items WHERE user_id = ? ORDER BY name_key, name`,
		Params: []any{userID},
	})
	if err != nil {
		return nil, fmt.Errorf("load pantry: %w", err)
	}
	if len(results) == 0 {
		return []PantryItem{}, nil
	}
	return decodePantryItems(results[0].Rows)
}

func decodePantryItems(rows []json.RawMessage) ([]PantryItem, error) {
	items := []PantryItem{}
	for _, raw := range rows {
		var item PantryItem
		if json.Unmarshal(raw, &item) != nil || strings.TrimSpace(item.Name) == "" || item.Quantity < 0 {
			return nil, errors.New("decode pantry item")
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Store) AddPantryItems(ctx context.Context, userID string, items []PantryItem, now time.Time) ([]PantryItem, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 || len(items) > maxBatchItems {
		return nil, ErrInvalid
	}
	addedAt := shoppingTimestamp(now)
	statements := make([]cloudflare.Statement, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(item.Name)
		if name == "" || len(name) > 500 || item.Quantity < 0 {
			return nil, ErrInvalid
		}
		statements = append(statements, cloudflare.Statement{
			SQL: `INSERT INTO pantry_items (user_id, name, name_key, quantity, added_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)
			      ON CONFLICT(user_id, name_key) DO UPDATE SET
			        quantity = pantry_items.quantity + excluded.quantity,
			        added_at = excluded.added_at,
			        expires_at = COALESCE(excluded.expires_at, pantry_items.expires_at)`,
			Params: []any{userID, name, strings.ToLower(name), item.Quantity, addedAt, nullableInt64(item.ExpiresAt)},
		})
	}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return nil, fmt.Errorf("add pantry items: %w", err)
	}
	pantry, err := s.Pantry(ctx, userID)
	if err != nil {
		return nil, err
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return pantry, nil
}

func (s *Store) RemovePantryItems(ctx context.Context, userID string, names []string) ([]PantryItem, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	if len(names) == 0 || len(names) > maxBatchItems {
		return nil, ErrInvalid
	}
	statements := make([]cloudflare.Statement, 0, len(names))
	for _, raw := range names {
		name := strings.TrimSpace(raw)
		if name == "" || len(name) > 500 {
			return nil, ErrInvalid
		}
		statements = append(statements, cloudflare.Statement{
			SQL:    `DELETE FROM pantry_items WHERE user_id = ? AND name_key = ?`,
			Params: []any{userID, strings.ToLower(name)},
		})
	}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return nil, fmt.Errorf("remove pantry items: %w", err)
	}
	pantry, err := s.Pantry(ctx, userID)
	if err != nil {
		return nil, err
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return pantry, nil
}

func (s *Store) SetPantryQuantity(ctx context.Context, userID, name string, quantity float64) ([]PantryItem, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	name = strings.TrimSpace(name)
	if name == "" || len(name) > 500 || quantity < 0 {
		return nil, ErrInvalid
	}
	statements := []cloudflare.Statement{{
		SQL:    `UPDATE pantry_items SET quantity = ? WHERE user_id = ? AND name_key = ? AND quantity <> ?`,
		Params: []any{quantity, userID, strings.ToLower(name), quantity},
	}}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return nil, fmt.Errorf("set pantry quantity: %w", err)
	}
	pantry, err := s.Pantry(ctx, userID)
	if err != nil {
		return nil, err
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return pantry, nil
}

func (s *Store) ClearPantry(ctx context.Context, userID string) error {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return err
	}
	statements := []cloudflare.Statement{{SQL: `DELETE FROM pantry_items WHERE user_id = ?`, Params: []any{userID}}}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return fmt.Errorf("clear pantry: %w", err)
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return nil
}

func (s *Store) Equipment(ctx context.Context, userID string) ([]EquipmentItem, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL:    `SELECT name, category, added_at FROM equipment_items WHERE user_id = ? ORDER BY name_key, name`,
		Params: []any{userID},
	})
	if err != nil {
		return nil, fmt.Errorf("load equipment: %w", err)
	}
	if len(results) == 0 {
		return []EquipmentItem{}, nil
	}
	return decodeEquipmentItems(results[0].Rows)
}

func decodeEquipmentItems(rows []json.RawMessage) ([]EquipmentItem, error) {
	items := []EquipmentItem{}
	for _, raw := range rows {
		var item EquipmentItem
		if json.Unmarshal(raw, &item) != nil || strings.TrimSpace(item.Name) == "" {
			return nil, errors.New("decode equipment item")
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Store) AddEquipment(ctx context.Context, userID string, items []EquipmentItem, now time.Time) ([]EquipmentItem, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	if len(items) == 0 || len(items) > maxBatchItems {
		return nil, ErrInvalid
	}
	addedAt := shoppingTimestamp(now)
	statements := make([]cloudflare.Statement, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(item.Name)
		category, categoryErr := normalizedOptionalString(item.Category, 200)
		if name == "" || len(name) > 500 || categoryErr != nil {
			return nil, ErrInvalid
		}
		statements = append(statements, cloudflare.Statement{
			SQL: `INSERT INTO equipment_items (user_id, name, name_key, category, added_at) VALUES (?, ?, ?, ?, ?)
			      ON CONFLICT(user_id, name_key) DO UPDATE SET
			        category = excluded.category
			      WHERE excluded.category IS NOT NULL AND excluded.category IS NOT equipment_items.category`,
			Params: []any{userID, name, strings.ToLower(name), nullableString(category), addedAt},
		})
	}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return nil, fmt.Errorf("add equipment: %w", err)
	}
	equipment, err := s.Equipment(ctx, userID)
	if err != nil {
		return nil, err
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return equipment, nil
}

func (s *Store) RemoveEquipment(ctx context.Context, userID string, names []string) ([]EquipmentItem, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	if len(names) == 0 || len(names) > maxBatchItems {
		return nil, ErrInvalid
	}
	statements := make([]cloudflare.Statement, 0, len(names))
	for _, raw := range names {
		name := strings.TrimSpace(raw)
		if name == "" || len(name) > 500 {
			return nil, ErrInvalid
		}
		statements = append(statements, cloudflare.Statement{
			SQL:    `DELETE FROM equipment_items WHERE user_id = ? AND name_key = ?`,
			Params: []any{userID, strings.ToLower(name)},
		})
	}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return nil, fmt.Errorf("remove equipment: %w", err)
	}
	equipment, err := s.Equipment(ctx, userID)
	if err != nil {
		return nil, err
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return equipment, nil
}

func (s *Store) ClearEquipment(ctx context.Context, userID string) error {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return err
	}
	statements := []cloudflare.Statement{{SQL: `DELETE FROM equipment_items WHERE user_id = ?`, Params: []any{userID}}}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return fmt.Errorf("clear equipment: %w", err)
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return nil
}

func (s *Store) RecordOrder(ctx context.Context, userID string, order Order, now time.Time) (Order, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return Order{}, err
	}
	if len(order.Items) == 0 || len(order.Items) > maxBatchItems {
		return Order{}, ErrInvalid
	}
	order.ID = strings.TrimSpace(order.ID)
	if len(order.ID) > 200 {
		return Order{}, ErrInvalid
	}
	if order.ID == "" {
		order.ID, err = s.newID("order")
		if err != nil {
			return Order{}, err
		}
	}
	if order.PlacedAt == 0 {
		order.PlacedAt = shoppingTimestamp(now)
	}
	order.LocationID, err = normalizedOptionalString(order.LocationID, 200)
	if err != nil {
		return Order{}, ErrInvalid
	}
	order.Notes, err = normalizedOptionalString(order.Notes, 4_000)
	if err != nil {
		return Order{}, ErrInvalid
	}
	order.TotalItems = 0
	for index := range order.Items {
		item := &order.Items[index]
		item.UPC, item.Name = strings.TrimSpace(item.UPC), strings.TrimSpace(item.Name)
		if item.Name == "" || len(item.Name) > 500 || item.Quantity < 0 {
			return Order{}, ErrInvalid
		}
		order.TotalItems += item.Quantity
	}
	statements := make([]cloudflare.Statement, 0, len(order.Items)+1)
	statements = append(statements, cloudflare.Statement{
		SQL: `INSERT INTO shopping_orders (id, user_id, total_items, estimated_total, placed_at, location_id, notes)
		      VALUES (?, ?, ?, ?, ?, ?, ?)`,
		Params: []any{order.ID, userID, order.TotalItems, nullableFloat64(order.EstimatedTotal), order.PlacedAt, nullableString(order.LocationID), nullableString(order.Notes)},
	})
	for position, item := range order.Items {
		statements = append(statements, cloudflare.Statement{
			SQL:    `INSERT INTO shopping_order_items (order_id, position, upc, name, quantity, price) VALUES (?, ?, ?, ?, ?, ?)`,
			Params: []any{order.ID, position, item.UPC, item.Name, item.Quantity, nullableFloat64(item.Price)},
		})
	}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return Order{}, fmt.Errorf("record shopping order: %w", err)
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return order, nil
}

func (s *Store) RecentOrders(ctx context.Context, userID string, limit int) ([]Order, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL: `SELECT id, total_items, estimated_total, placed_at, location_id, notes
			      FROM shopping_orders WHERE user_id = ? ORDER BY placed_at DESC, id DESC LIMIT ?`,
			Params: []any{userID, limit},
		},
		cloudflare.Statement{
			SQL: `SELECT soi.order_id, soi.position, soi.upc, soi.name, soi.quantity, soi.price
			      FROM shopping_order_items soi JOIN shopping_orders so ON so.id = soi.order_id
			      WHERE so.user_id = ? AND soi.order_id IN (
			        SELECT id FROM shopping_orders WHERE user_id = ? ORDER BY placed_at DESC, id DESC LIMIT ?
			      ) ORDER BY so.placed_at DESC, soi.position`,
			Params: []any{userID, userID, limit},
		},
	)
	if err != nil {
		return nil, fmt.Errorf("load recent shopping orders: %w", err)
	}
	if len(results) == 0 {
		return []Order{}, nil
	}
	var itemRows []json.RawMessage
	if len(results) > 1 {
		itemRows = results[1].Rows
	}
	return decodeRecentOrders(results[0].Rows, itemRows)
}

func decodeRecentOrders(orderRows, itemRows []json.RawMessage) ([]Order, error) {
	orders := []Order{}
	orderIndexes := make(map[string]int, len(orderRows))
	for _, raw := range orderRows {
		var order Order
		if json.Unmarshal(raw, &order) != nil || strings.TrimSpace(order.ID) == "" || order.TotalItems < 0 {
			return nil, errors.New("decode shopping order")
		}
		order.Items = []OrderItem{}
		orderIndexes[order.ID] = len(orders)
		orders = append(orders, order)
	}
	for _, raw := range itemRows {
		var row struct {
			OrderID  string   `json:"order_id"`
			Position int      `json:"position"`
			UPC      string   `json:"upc"`
			Name     string   `json:"name"`
			Quantity int      `json:"quantity"`
			Price    *float64 `json:"price"`
		}
		if json.Unmarshal(raw, &row) != nil || row.OrderID == "" || row.Name == "" || row.Quantity < 0 || row.Position < 0 {
			return nil, errors.New("decode shopping order item")
		}
		index, ok := orderIndexes[row.OrderID]
		if !ok {
			continue
		}
		orders[index].Items = append(orders[index].Items, OrderItem{UPC: row.UPC, Name: row.Name, Quantity: row.Quantity, Price: row.Price})
	}
	return orders, nil
}

func (s *Store) PreferredStore(ctx context.Context, userID string) (*PreferredStore, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL:    `SELECT location_id, name, address, chain, set_at FROM preferred_stores WHERE user_id = ? LIMIT 1`,
		Params: []any{userID},
	})
	if err != nil {
		return nil, fmt.Errorf("load preferred store: %w", err)
	}
	if len(results) == 0 || len(results[0].Rows) == 0 {
		return nil, nil
	}
	return decodePreferredStore(results[0].Rows)
}

func decodePreferredStore(rows []json.RawMessage) (*PreferredStore, error) {
	if len(rows) == 0 {
		return nil, nil
	}
	var store PreferredStore
	if json.Unmarshal(rows[0], &store) != nil || strings.TrimSpace(store.LocationID) == "" || strings.TrimSpace(store.Name) == "" {
		return nil, errors.New("decode preferred store")
	}
	return &store, nil
}

func (s *Store) SetPreferredStore(ctx context.Context, userID string, store PreferredStore, now time.Time) (PreferredStore, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return PreferredStore{}, err
	}
	store.LocationID = strings.TrimSpace(store.LocationID)
	store.Name = strings.TrimSpace(store.Name)
	store.Address = strings.TrimSpace(store.Address)
	store.Chain = strings.TrimSpace(store.Chain)
	if store.LocationID == "" || len(store.LocationID) > 200 || store.Name == "" || len(store.Name) > 500 || len(store.Address) > 1_000 || len(store.Chain) > 200 {
		return PreferredStore{}, ErrInvalid
	}
	store.SetAt = shoppingTimestamp(now)
	statements := []cloudflare.Statement{{
		SQL: `INSERT INTO preferred_stores (user_id, location_id, name, address, chain, set_at) VALUES (?, ?, ?, ?, ?, ?)
		      ON CONFLICT(user_id) DO UPDATE SET
		        location_id = excluded.location_id,
		        name = excluded.name,
		        address = excluded.address,
		        chain = excluded.chain,
		        set_at = excluded.set_at
		      WHERE preferred_stores.location_id IS NOT excluded.location_id
		         OR preferred_stores.name IS NOT excluded.name
		         OR preferred_stores.address IS NOT excluded.address
		         OR preferred_stores.chain IS NOT excluded.chain`,
		Params: []any{userID, store.LocationID, store.Name, store.Address, store.Chain, store.SetAt},
	}, {
		SQL:    `SELECT location_id, name, address, chain, set_at FROM preferred_stores WHERE user_id = ? LIMIT 1`,
		Params: []any{userID},
	}}
	results, err := s.d1.Run(ctx, statements...)
	if err != nil {
		return PreferredStore{}, fmt.Errorf("set preferred store: %w", err)
	}
	if len(results) < 2 {
		return PreferredStore{}, errors.New("set preferred store: incomplete D1 results")
	}
	canonical, err := decodePreferredStore(results[1].Rows)
	if err != nil || canonical == nil {
		if err == nil {
			err = errors.New("preferred store was not persisted")
		}
		return PreferredStore{}, err
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return *canonical, nil
}

func (s *Store) ClearPreferredStore(ctx context.Context, userID string) error {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return err
	}
	statements := []cloudflare.Statement{{SQL: `DELETE FROM preferred_stores WHERE user_id = ?`, Params: []any{userID}}}
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return fmt.Errorf("clear preferred store: %w", err)
	}
	s.enqueueShoppingProfileSnapshot(userID)
	return nil
}

func (s *Store) FrequentItems(ctx context.Context, userID string) ([]FrequentItem, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return nil, err
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL: `SELECT MIN(soi.name) AS name, COALESCE(MIN(NULLIF(soi.upc, '')), '') AS upc,
		             COUNT(DISTINCT soi.order_id) AS orders, SUM(soi.quantity) AS total_quantity
		      FROM shopping_order_items soi JOIN shopping_orders so ON so.id = soi.order_id
		      WHERE so.user_id = ? GROUP BY lower(soi.name)
		      ORDER BY COUNT(DISTINCT soi.order_id) DESC, lower(soi.name), MIN(soi.name) LIMIT 20`,
		Params: []any{userID},
	})
	if err != nil {
		return nil, fmt.Errorf("load frequent shopping items: %w", err)
	}
	if len(results) == 0 {
		return []FrequentItem{}, nil
	}
	return decodeFrequentItems(results[0].Rows)
}

func decodeFrequentItems(rows []json.RawMessage) ([]FrequentItem, error) {
	items := []FrequentItem{}
	for _, raw := range rows {
		var item FrequentItem
		if json.Unmarshal(raw, &item) != nil || item.Name == "" || item.Orders < 0 || item.TotalQuantity < 0 {
			return nil, errors.New("decode frequent shopping item")
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Store) ShoppingProfile(ctx context.Context, userID string) (ShoppingProfile, error) {
	userID, err := s.shoppingUserID(userID)
	if err != nil {
		return ShoppingProfile{}, err
	}
	return s.loadShoppingProfile(ctx, userID)
}

func (s *Store) loadShoppingProfile(ctx context.Context, userID string) (ShoppingProfile, error) {
	snapshot, err := s.loadShoppingProfileSnapshot(ctx, userID)
	if err != nil {
		return ShoppingProfile{}, err
	}
	return snapshot.Profile, nil
}

type shoppingProfileArtifactReference struct {
	ProfileRevision int64  `json:"profile_revision"`
	ArtifactVersion int64  `json:"artifact_version"`
	ContentSHA256   string `json:"content_sha256"`
}

type shoppingProfileSnapshot struct {
	Profile   ShoppingProfile
	Revision  int64
	Reference *shoppingProfileArtifactReference
}

func (s *Store) loadShoppingProfileSnapshot(ctx context.Context, userID string) (shoppingProfileSnapshot, error) {
	const recentOrderLimit = 50
	results, err := s.d1.Run(
		ctx,
		cloudflare.Statement{
			SQL:    `SELECT location_id, name, address, chain, set_at FROM preferred_stores WHERE user_id = ? LIMIT 1`,
			Params: []any{userID},
		},
		cloudflare.Statement{
			SQL:    `SELECT name, quantity, added_at, expires_at FROM pantry_items WHERE user_id = ? ORDER BY name_key, name`,
			Params: []any{userID},
		},
		cloudflare.Statement{
			SQL:    `SELECT name, category, added_at FROM equipment_items WHERE user_id = ? ORDER BY name_key, name`,
			Params: []any{userID},
		},
		cloudflare.Statement{
			SQL: `SELECT id, total_items, estimated_total, placed_at, location_id, notes
			      FROM shopping_orders WHERE user_id = ? ORDER BY placed_at DESC, id DESC LIMIT ?`,
			Params: []any{userID, recentOrderLimit},
		},
		cloudflare.Statement{
			SQL: `SELECT soi.order_id, soi.position, soi.upc, soi.name, soi.quantity, soi.price
			      FROM shopping_order_items soi JOIN shopping_orders so ON so.id = soi.order_id
			      WHERE so.user_id = ? AND soi.order_id IN (
			        SELECT id FROM shopping_orders WHERE user_id = ? ORDER BY placed_at DESC, id DESC LIMIT ?
			      ) ORDER BY so.placed_at DESC, soi.position`,
			Params: []any{userID, userID, recentOrderLimit},
		},
		cloudflare.Statement{
			SQL: `SELECT MIN(soi.name) AS name, COALESCE(MIN(NULLIF(soi.upc, '')), '') AS upc,
			             COUNT(DISTINCT soi.order_id) AS orders, SUM(soi.quantity) AS total_quantity
			      FROM shopping_order_items soi JOIN shopping_orders so ON so.id = soi.order_id
			      WHERE so.user_id = ? GROUP BY lower(soi.name)
			      ORDER BY COUNT(DISTINCT soi.order_id) DESC, lower(soi.name), MIN(soi.name) LIMIT 20`,
			Params: []any{userID},
		},
		cloudflare.Statement{
			SQL:    `SELECT revision FROM shopping_profile_revisions WHERE user_id = ? LIMIT 1`,
			Params: []any{userID},
		},
		cloudflare.Statement{
			SQL: `SELECT profile_revision, artifact_version, content_sha256
			      FROM shopping_profile_artifacts WHERE user_id = ? LIMIT 1`,
			Params: []any{userID},
		},
	)
	if err != nil {
		return shoppingProfileSnapshot{}, fmt.Errorf("load shopping profile: %w", err)
	}
	if len(results) != 8 {
		return shoppingProfileSnapshot{}, errors.New("load shopping profile: incomplete D1 results")
	}

	profile := ShoppingProfile{}
	profile.PreferredStore, err = decodePreferredStore(results[0].Rows)
	if err != nil {
		return shoppingProfileSnapshot{}, err
	}
	profile.Pantry, err = decodePantryItems(results[1].Rows)
	if err != nil {
		return shoppingProfileSnapshot{}, err
	}
	profile.Equipment, err = decodeEquipmentItems(results[2].Rows)
	if err != nil {
		return shoppingProfileSnapshot{}, err
	}
	profile.RecentOrders, err = decodeRecentOrders(results[3].Rows, results[4].Rows)
	if err != nil {
		return shoppingProfileSnapshot{}, err
	}
	profile.FrequentItems, err = decodeFrequentItems(results[5].Rows)
	if err != nil {
		return shoppingProfileSnapshot{}, err
	}

	snapshot := shoppingProfileSnapshot{Profile: profile}
	if len(results[6].Rows) > 0 {
		var row struct {
			Revision int64 `json:"revision"`
		}
		if json.Unmarshal(results[6].Rows[0], &row) != nil || row.Revision <= 0 {
			return shoppingProfileSnapshot{}, errors.New("decode shopping profile revision")
		}
		snapshot.Revision = row.Revision
	}
	if len(results[7].Rows) > 0 {
		var reference shoppingProfileArtifactReference
		if json.Unmarshal(results[7].Rows[0], &reference) != nil || reference.ProfileRevision <= 0 ||
			reference.ArtifactVersion <= 0 || strings.TrimSpace(reference.ContentSHA256) == "" {
			return shoppingProfileSnapshot{}, errors.New("decode shopping profile artifact reference")
		}
		snapshot.Reference = &reference
	}
	return snapshot, nil
}

func (s *Store) ResolveShopper(ctx context.Context, krogerSub string) (string, error) {
	if err := s.ready(); err != nil {
		return "", err
	}
	krogerSub = strings.TrimSpace(krogerSub)
	if krogerSub == "" {
		return "", ErrInvalid
	}
	results, err := s.d1.Run(ctx, cloudflare.Statement{
		SQL:    `SELECT clerk_user_id FROM kroger_account_links WHERE kroger_sub = ? LIMIT 1`,
		Params: []any{krogerSub},
	})
	if err != nil {
		return "", fmt.Errorf("resolve Kroger shopper: %w", err)
	}
	if len(results) == 0 || len(results[0].Rows) == 0 {
		return "kroger:" + krogerSub, nil
	}
	var row struct {
		ClerkUserID string `json:"clerk_user_id"`
	}
	if json.Unmarshal(results[0].Rows[0], &row) != nil || strings.TrimSpace(row.ClerkUserID) == "" {
		return "", errors.New("decode Kroger account link")
	}
	return row.ClerkUserID, nil
}

func (s *Store) LinkKrogerAccount(ctx context.Context, krogerSub, clerkUserID string, now time.Time) error {
	if err := s.ready(); err != nil {
		return err
	}
	krogerSub, clerkUserID = strings.TrimSpace(krogerSub), strings.TrimSpace(clerkUserID)
	if krogerSub == "" || clerkUserID == "" {
		return ErrInvalid
	}
	namespacedUserID := "kroger:" + krogerSub
	statements := []cloudflare.Statement{{
		SQL: `INSERT INTO kroger_account_links (kroger_sub, clerk_user_id, linked_at) VALUES (?, ?, ?)
		      ON CONFLICT(kroger_sub) DO UPDATE SET
		        clerk_user_id = excluded.clerk_user_id,
		        linked_at = excluded.linked_at
		      WHERE kroger_account_links.clerk_user_id <> excluded.clerk_user_id`,
		Params: []any{krogerSub, clerkUserID, shoppingTimestamp(now)},
	}}
	tables := []struct {
		name       string
		userColumn string
	}{
		{name: "pantry_items", userColumn: "user_id"},
		{name: "equipment_items", userColumn: "user_id"},
		{name: "shopping_orders", userColumn: "user_id"},
		{name: "preferred_stores", userColumn: "user_id"},
		{name: "grocery_lists", userColumn: "owner_user_id"},
		{name: "recipes", userColumn: "owner_user_id"},
	}
	for _, table := range tables {
		statements = append(
			statements,
			cloudflare.Statement{
				SQL:    fmt.Sprintf("UPDATE OR IGNORE %s SET %s = ? WHERE %s = ?", table.name, table.userColumn, table.userColumn),
				Params: []any{clerkUserID, namespacedUserID},
			},
			cloudflare.Statement{
				SQL:    fmt.Sprintf("DELETE FROM %s WHERE %s = ?", table.name, table.userColumn),
				Params: []any{namespacedUserID},
			},
		)
	}
	statements = append(
		statements,
		cloudflare.Statement{SQL: `DELETE FROM shopping_profile_artifacts WHERE user_id = ?`, Params: []any{namespacedUserID}},
		cloudflare.Statement{SQL: `DELETE FROM shopping_profile_snapshot_jobs WHERE user_id = ?`, Params: []any{namespacedUserID}},
		cloudflare.Statement{SQL: `DELETE FROM shopping_profile_revisions WHERE user_id = ?`, Params: []any{namespacedUserID}},
	)
	if _, err := s.d1.Run(ctx, statements...); err != nil {
		return fmt.Errorf("link Kroger account: %w", err)
	}
	s.enqueueShoppingProfileSnapshotWithCleanup(clerkUserID, namespacedUserID)
	return nil
}

func (s *Store) shoppingUserID(userID string) (string, error) {
	if err := s.ready(); err != nil {
		return "", err
	}
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return "", ErrInvalid
	}
	return userID, nil
}

// shoppingTimestamp is deliberately separate from timestamp in store.go.
// Legacy household/list/recipe rows use Unix milliseconds; shopping-profile
// rows are part of the gateway contract and use Unix seconds.
func shoppingTimestamp(now time.Time) int64 {
	if now.IsZero() {
		now = time.Now()
	}
	return now.UTC().Unix()
}

func normalizedOptionalString(value *string, maxLength int) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if len(trimmed) > maxLength {
		return nil, ErrInvalid
	}
	if trimmed == "" {
		return nil, nil
	}
	return &trimmed, nil
}

func nullableInt64(value *int64) any {
	if value == nil {
		return nil
	}
	return *value
}

func nullableFloat64(value *float64) any {
	if value == nil {
		return nil
	}
	return *value
}
