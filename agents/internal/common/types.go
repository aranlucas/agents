package common

type CartItem struct {
	Name     string  `json:"name"`
	Quantity int     `json:"quantity"`
	Price    float64 `json:"price"`
	UPC      string  `json:"upc"`
}

type ProductMatch struct {
	Query    string  `json:"query"`
	Name     string  `json:"name"`
	UPC      string  `json:"upc"`
	ImageURL string  `json:"image_url,omitempty"`
	Price    float64 `json:"price,omitempty"`
	Size     string  `json:"size,omitempty"`
}

type PantryItem struct {
	Name     string  `json:"name"`
	Quantity string  `json:"quantity"`
	Expires  *string `json:"expires,omitempty"`
}
