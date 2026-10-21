module github.com/aranlucas/agents

go 1.27.3

require (
	cloud.google.com/go/bigquery v1.85.0
	github.com/ag-ui-protocol/ag-ui/sdks/community/go v0.0.0-20261021183439-85a427d0558d
	github.com/clerk/clerk-sdk-go/v2 v2.7.0
	github.com/getsentry/sentry-go v0.50.0
	github.com/glebarez/go-sqlite v1.23.0
	github.com/glebarez/sqlite v1.11.0
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/google/jsonschema-go v0.4.3
	github.com/joho/godotenv v1.5.1
	github.com/modelcontextprotocol/go-sdk v1.8.0
	github.com/openai/openai-go/v3 v3.85.0 // ADK v2.5.0 sources streamed function names from output_item.added; verified with v3.68.0.
	github.com/railwayapp/railway-go-sdk v0.4.0
	github.com/wI2L/jsondiff v0.7.1
	go.opentelemetry.io/otel v1.47.0
	go.opentelemetry.io/otel/trace v1.47.0
	golang.org/x/net v0.61.0
	golang.org/x/sync v0.24.0
	google.golang.org/adk/v2 v2.6.0
	google.golang.org/api v0.307.0
	google.golang.org/genai v1.75.0
	gorm.io/gorm v1.31.2
)

require (
	cloud.google.com/go v0.123.0 // indirect
	cloud.google.com/go/auth v0.24.1 // indirect
	cloud.google.com/go/auth/oauth2adapt v0.3.0 // indirect
	cloud.google.com/go/compute/metadata v0.10.0 // indirect
	cloud.google.com/go/iam v1.14.0 // indirect
	github.com/apache/arrow/go/v15 v15.0.2 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/coder/websocket v1.8.15 // indirect
	github.com/dustin/go-humanize v1.1.0 // indirect
	github.com/felixge/httpsnoop v1.1.0 // indirect
	github.com/go-jose/go-jose/v3 v3.0.5 // indirect
	github.com/go-logr/logr v1.4.4 // indirect
	github.com/go-logr/stdr v1.2.2 // indirect
	github.com/goccy/go-json v0.11.2 // indirect
	github.com/google/flatbuffers v25.12.19+incompatible // indirect
	github.com/google/go-cmp v0.7.0 // indirect
	github.com/google/s2a-go v0.1.11 // indirect
	github.com/google/safehtml v0.1.0 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/googleapis/enterprise-certificate-proxy v0.3.24 // indirect
	github.com/googleapis/gax-go/v2 v2.27.0 // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/jinzhu/inflection v1.0.0 // indirect
	github.com/jinzhu/now v1.1.5 // indirect
	github.com/klauspost/compress v1.20.3 // indirect
	github.com/klauspost/cpuid/v2 v2.4.1 // indirect
	github.com/mattn/go-isatty v0.0.24 // indirect
	github.com/ncruces/go-strftime v1.1.0 // indirect
	github.com/pierrec/lz4/v4 v4.1.33 // indirect
	github.com/remyoudompheng/bigfft v0.0.0-20230129092748-24d4a6f8daec // indirect
	github.com/segmentio/asm v1.2.1 // indirect
	github.com/segmentio/encoding v0.5.4 // indirect
	github.com/sirupsen/logrus v1.10.2 // indirect
	github.com/tidwall/gjson v1.20.0 // indirect
	github.com/tidwall/match v1.2.0 // indirect
	github.com/tidwall/pretty v1.2.2 // indirect
	github.com/tidwall/sjson v1.2.5 // indirect
	github.com/yosida95/uritemplate/v3 v3.0.2 // indirect
	github.com/zeebo/xxh3 v1.1.0 // indirect
	go.opentelemetry.io/auto/sdk v1.2.1 // indirect
	go.opentelemetry.io/contrib/instrumentation/google.golang.org/grpc/otelgrpc v0.72.0 // indirect
	go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp v0.72.0 // indirect
	go.opentelemetry.io/otel/log v1.47.0 // indirect; required by the current ADK telemetry API
	go.opentelemetry.io/otel/metric v1.47.0 // indirect
	golang.org/x/crypto v0.58.0 // indirect
	golang.org/x/exp v0.0.0-20261014143641-f0251eb4aa3e // indirect
	golang.org/x/mod v0.42.0 // indirect
	golang.org/x/oauth2 v0.37.0 // indirect
	golang.org/x/sys v0.49.0 // indirect
	golang.org/x/telemetry v0.0.0-20261021172232-6cd571d43fbb // indirect
	golang.org/x/text v0.43.0 // indirect
	golang.org/x/time v0.16.0 // indirect
	golang.org/x/tools v0.52.0 // indirect
	golang.org/x/xerrors v0.0.0-20240903120638-7835f813f4da // indirect
	google.golang.org/genproto v0.0.0-20261019180522-ce908d29299b // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20261019180522-ce908d29299b // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20261019180522-ce908d29299b // indirect
	google.golang.org/grpc v1.84.0 // indirect
	google.golang.org/protobuf v1.36.12 // indirect
	modernc.org/libc v1.79.0 // indirect
	modernc.org/mathutil v1.7.1 // indirect
	modernc.org/memory v1.12.1 // indirect
	modernc.org/sqlite v1.61.0 // indirect
	rsc.io/omap v1.2.0 // indirect
	rsc.io/ordered v1.1.1 // indirect
)
