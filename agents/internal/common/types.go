package common

type CartItem struct {
	Name     string  `json:"name"`
	Quantity int     `json:"quantity"`
	Price    float64 `json:"price"`
	UPC      string  `json:"upc"`
}
type PantryItem struct {
	Name     string  `json:"name"`
	Quantity string  `json:"quantity"`
	Expires  *string `json:"expires,omitempty"`
}
