package telegram

import "strings"

const markdownV2Special = "_[]()~`>#+-=|{}.!*\\"

func ChunkMarkdownV2(text string, maximum int) []string {
	if maximum <= 0 {
		maximum = 4096
	}
	chunks := []string{}
	current := make([]rune, 0, maximum)
	flush := func() {
		if len(current) > 0 {
			chunks = append(chunks, string(current))
			current = make([]rune, 0, maximum)
		}
	}
	for _, value := range text {
		token := []rune{value}
		if strings.ContainsRune(markdownV2Special, value) {
			token = []rune{'\\', value}
		}
		if len(current)+len(token) > maximum {
			flush()
		}
		current = append(current, token...)
	}
	flush()
	return chunks
}
