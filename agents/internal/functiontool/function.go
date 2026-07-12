package functiontool

import (
	"github.com/google/jsonschema-go/jsonschema"
	"google.golang.org/adk/v2/agent"
	adktool "google.golang.org/adk/v2/tool"
	adkfunctiontool "google.golang.org/adk/v2/tool/functiontool"
)

type Config = adkfunctiontool.Config
type Func[TArgs, TResults any] func(agent.Context, TArgs) (TResults, error)

func New[TArgs, TResults any](cfg Config, handler func(agent.Context, TArgs) (TResults, error)) (adktool.Tool, error) {
	if cfg.InputSchema == nil {
		schema, err := jsonschema.For[TArgs](nil)
		if err != nil {
			return nil, err
		}
		removeAdvertisedNulls(schema)
		cfg.InputSchema = schema
	}
	return adkfunctiontool.New(cfg, adkfunctiontool.Func[TArgs, TResults](handler))
}

func removeAdvertisedNulls(schema *jsonschema.Schema) {
	if schema == nil {
		return
	}
	types := schema.Types[:0]
	for _, typ := range schema.Types {
		if typ != "null" {
			types = append(types, typ)
		}
	}
	schema.Types = types
	if len(types) == 1 {
		schema.Type = types[0]
		schema.Types = nil
	}
	for _, child := range schema.Properties {
		removeAdvertisedNulls(child)
	}
	removeAdvertisedNulls(schema.Items)
	removeAdvertisedNulls(schema.AdditionalProperties)
	for _, children := range [][]*jsonschema.Schema{schema.PrefixItems, schema.ItemsArray, schema.AllOf, schema.AnyOf, schema.OneOf} {
		for _, child := range children {
			removeAdvertisedNulls(child)
		}
	}
}
