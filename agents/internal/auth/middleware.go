package auth

import (
	"context"
	json "encoding/json/v2"
	"net/http"
	"strings"
)

type identityContextKey struct{}

// FromContext returns the identity installed by RequireIdentity.
func FromContext(ctx context.Context) (Identity, bool) {
	identity, ok := ctx.Value(identityContextKey{}).(Identity)
	return identity, ok
}

// RequireIdentity protects every route except explicitly public paths. Entries
// ending in * are prefix matches, used for runtime paths whose final segment is
// a caller-supplied thread ID. A verifier is optional so construction can fail
// closed while configuration is assembled; protected requests always return
// 401 when none is supplied. When multiple verifiers are supplied, the first
// one to validate the token determines the immutable request identity.
func RequireIdentity(publicRoutes map[string]bool, next http.Handler, verifiers ...TokenVerifier) http.Handler {
	configured := make([]TokenVerifier, 0, len(verifiers))
	for _, verifier := range verifiers {
		if verifier != nil {
			configured = append(configured, verifier)
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		public := isPublicRoute(publicRoutes, r.URL.Path)
		token, hasToken := bearerToken(r.Header.Get("Authorization"))
		if public && (!hasToken || len(configured) == 0) {
			identity := Identity{UserID: "anonymous", Public: true}
			next.ServeHTTP(w, withIdentity(r, identity))
			return
		}
		if !hasToken || len(configured) == 0 {
			writeUnauthorized(w)
			return
		}
		for _, verifier := range configured {
			identity, err := verifier.Verify(r.Context(), token)
			if err == nil {
				next.ServeHTTP(w, withIdentity(r, identity))
				return
			}
		}
		writeUnauthorized(w)
	})
}

func isPublicRoute(publicRoutes map[string]bool, path string) bool {
	if publicRoutes[path] {
		return true
	}
	for pattern, enabled := range publicRoutes {
		if enabled && strings.HasSuffix(pattern, "*") && strings.HasPrefix(path, strings.TrimSuffix(pattern, "*")) {
			return true
		}
	}
	return false
}

func withIdentity(r *http.Request, identity Identity) *http.Request {
	clone := r.Clone(context.WithValue(r.Context(), identityContextKey{}, identity))
	clone.Header = r.Header.Clone()
	clone.Header.Del("x-clerk-user-id")
	clone.Header.Set("x-clerk-user-id", identity.UserID)
	return clone
}

func bearerToken(header string) (string, bool) {
	parts := strings.Fields(header)
	returnValue := ""
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		returnValue = parts[1]
	}
	return returnValue, returnValue != ""
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_ = json.MarshalWrite(w, map[string]string{"detail": "Unauthorized"})
}

// CORS emits credentialed browser headers for configured exact origins. A
// wildcard policy reflects the request origin because browsers reject
// Access-Control-Allow-Origin: * on credentialed requests.
func CORS(origins []string, next http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	allowAll := false
	for _, origin := range origins {
		if origin = strings.TrimSpace(origin); origin == "*" {
			allowAll = true
		} else if origin != "" {
			allowed[origin] = true
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		w.Header().Add("Vary", "Origin")
		originAllowed := origin != "" && (allowAll || allowed[origin])
		if originAllowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Baggage, Content-Type, Sentry-Trace, X-Clerk-User-Id")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			if !originAllowed {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
