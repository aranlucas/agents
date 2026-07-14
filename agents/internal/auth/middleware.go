package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type identityContextKey struct{}

// FromContext returns the identity installed by RequireIdentity.
func FromContext(ctx context.Context) (Identity, bool) {
	identity, ok := ctx.Value(identityContextKey{}).(Identity)
	return identity, ok
}

// RequireIdentity protects every route except exact explicitly public paths.
// A verifier is optional so construction can fail closed while configuration is
// assembled; protected requests always return 401 when none is supplied.
func RequireIdentity(publicRoutes map[string]bool, next http.Handler, verifiers ...TokenVerifier) http.Handler {
	var verifier TokenVerifier
	if len(verifiers) > 0 {
		verifier = verifiers[0]
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		public := publicRoutes[r.URL.Path]
		token, hasToken := bearerToken(r.Header.Get("Authorization"))
		if public && (!hasToken || verifier == nil) {
			identity := Identity{UserID: "anonymous", Public: true}
			next.ServeHTTP(w, withIdentity(r, identity))
			return
		}
		if !hasToken || verifier == nil {
			writeUnauthorized(w)
			return
		}
		identity, err := verifier.Verify(r.Context(), token)
		if err != nil {
			writeUnauthorized(w)
			return
		}
		next.ServeHTTP(w, withIdentity(r, identity))
	})
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
	_ = json.NewEncoder(w).Encode(map[string]string{"detail": "Unauthorized"})
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
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
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
