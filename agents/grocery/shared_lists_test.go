package grocery

import (
	"context"
	"iter"
	"testing"
	"time"

	"agents/internal/groceries"
	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/session"
)

func TestSaveListToHouseholdDefaultsExactlyOneHousehold(t *testing.T) {
	repository := &sharedListRepository{households: []groceries.Household{{ID: "hh_1", Name: "Home"}}, member: true}
	state := mutableGroceryState{
		"shopping_list":   []string{"Milk", "Eggs"},
		"product_matches": []ProductMatch{{Query: "Milk", Size: "1 gal"}},
		"status":          StatusReady,
	}
	shared := SharedLists{Repository: repository, Now: func() time.Time { return time.UnixMilli(2000) }}

	result, err := shared.SaveListToHousehold(newSharedListContext(t, "user_1", state), SaveListArgs{Title: "Weekly"})
	if err != nil || !result.OK || result.ListID != "list_1" || result.HouseholdID != "hh_1" || result.Count != 2 {
		t.Fatalf("result/error = %#v / %v", result, err)
	}
	if repository.createdBy != "user_1" || repository.createdHousehold != "hh_1" || repository.createdTitle != "Weekly" {
		t.Fatalf("created list = user %q household %q title %q", repository.createdBy, repository.createdHousehold, repository.createdTitle)
	}
	if len(repository.items) != 2 || repository.items[0].Name != "Milk" || repository.items[0].Quantity != "1 gal" || repository.items[1].Quantity != "1" {
		t.Fatalf("items = %#v", repository.items)
	}
}

func TestSaveListToHouseholdRequiresIDForMultipleHouseholds(t *testing.T) {
	repository := &sharedListRepository{households: []groceries.Household{{ID: "hh_1"}, {ID: "hh_2"}}}
	state := mutableGroceryState{"shopping_list": []string{"Milk"}, "status": StatusReady}

	result, err := (SharedLists{Repository: repository}).SaveListToHousehold(newSharedListContext(t, "user_1", state), SaveListArgs{Title: "Weekly"})
	if err != nil || result.Error == nil || result.Error.Code != "household_id_required" || repository.createdTitle != "" {
		t.Fatalf("result/error/created = %#v / %v / %q", result, err, repository.createdTitle)
	}
}

func TestSaveListToHouseholdRejectsNonMember(t *testing.T) {
	repository := &sharedListRepository{}
	householdID := "hh_other"
	state := mutableGroceryState{"shopping_list": []string{"Milk"}, "status": StatusReady}

	result, err := (SharedLists{Repository: repository}).SaveListToHousehold(newSharedListContext(t, "user_1", state), SaveListArgs{HouseholdID: &householdID, Title: "Weekly"})
	if err != nil || result.Error == nil || result.Error.Code != "household_forbidden" || repository.createdTitle != "" {
		t.Fatalf("result/error/created = %#v / %v / %q", result, err, repository.createdTitle)
	}
}

func TestSharedListToolIsRegisteredWhenStoreIsConfigured(t *testing.T) {
	tools, err := groceryTools(nil, nil, &sharedListRepository{})
	if err != nil {
		t.Fatal(err)
	}
	for _, candidate := range tools {
		if candidate.Name() == "save_list_to_household" {
			return
		}
	}
	t.Fatal("save_list_to_household tool was not registered")
}

type sharedListRepository struct {
	groceries.Repository
	households       []groceries.Household
	member           bool
	createdBy        string
	createdHousehold string
	createdTitle     string
	items            []groceries.NewItem
}

func (r *sharedListRepository) ListHouseholds(context.Context, string) ([]groceries.Household, error) {
	return r.households, nil
}

func (r *sharedListRepository) IsMember(context.Context, string, string) (bool, error) {
	return r.member, nil
}

func (r *sharedListRepository) CreateList(_ context.Context, userID string, householdID *string, title string, _ time.Time) (groceries.List, error) {
	r.createdBy = userID
	if householdID != nil {
		r.createdHousehold = *householdID
	}
	r.createdTitle = title
	return groceries.List{ID: "list_1", HouseholdID: householdID, OwnerUserID: userID, Title: title, Status: "active", Items: []groceries.Item{}}, nil
}

func (r *sharedListRepository) AddItems(_ context.Context, _ string, _ string, items []groceries.NewItem, _ time.Time) ([]groceries.Item, error) {
	r.items = append([]groceries.NewItem(nil), items...)
	return []groceries.Item{}, nil
}

type mutableGroceryState map[string]any

func (state mutableGroceryState) Get(key string) (any, error) {
	value, ok := state[key]
	if !ok {
		return nil, session.ErrStateKeyNotExist
	}
	return value, nil
}

func (state mutableGroceryState) Set(key string, value any) error {
	state[key] = value
	return nil
}

func (state mutableGroceryState) All() iter.Seq2[string, any] {
	return func(yield func(string, any) bool) {
		for key, value := range state {
			if !yield(key, value) {
				return
			}
		}
	}
}

type sharedListContext struct {
	agent.StrictContextMock
	userID string
	state  mutableGroceryState
}

func newSharedListContext(t *testing.T, userID string, state mutableGroceryState) *sharedListContext {
	t.Helper()
	return &sharedListContext{StrictContextMock: agent.NewStrictContextMock(t.Context()), userID: userID, state: state}
}

func (ctx *sharedListContext) UserID() string                       { return ctx.userID }
func (ctx *sharedListContext) State() session.State                 { return ctx.state }
func (ctx *sharedListContext) ReadonlyState() session.ReadonlyState { return ctx.state }
