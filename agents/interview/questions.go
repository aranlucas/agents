package interview

import "strings"

type bankQuestion struct {
	Question
	Hints []string
}

var questionBank = []bankQuestion{
	{
		Question: Question{
			ID: "behavioral-disagreement", Track: TrackBehavioral, Title: "Disagreeing on a technical direction",
			Prompt: "Tell me about a time you disagreed with a teammate or partner about a technical direction. How did you reach a decision?",
			Topic:  "conflict", Competency: "collaboration and judgment",
		},
	},
	{
		Question: Question{
			ID: "behavioral-incident", Track: TrackBehavioral, Title: "Owning a production incident",
			Prompt: "Tell me about a production incident you helped resolve. What did you personally do during and after the incident?",
			Topic:  "ownership", Competency: "ownership and operational excellence",
		},
	},
	{
		Question: Question{
			ID: "behavioral-ambiguity", Track: TrackBehavioral, Title: "Leading through ambiguity",
			Prompt: "Describe a project where the goal or requirements were ambiguous. How did you create clarity and move the work forward?",
			Topic:  "ambiguity", Competency: "execution and leadership",
		},
	},
	{
		Question: Question{
			ID: "behavioral-influence", Track: TrackBehavioral, Title: "Influencing without authority",
			Prompt: "Tell me about a time you influenced an important decision without having formal authority over the people involved.",
			Topic:  "influence", Competency: "influence and communication",
		},
	},
	{
		Question: Question{
			ID: "behavioral-mentoring", Track: TrackBehavioral, Title: "Growing another engineer",
			Prompt: "Tell me about a time you helped another engineer grow. How did you adapt your support to what they needed?",
			Topic:  "mentoring", Competency: "team development",
		},
	},
	{
		Question: Question{
			ID: "behavioral-failure", Track: TrackBehavioral, Title: "Learning from a failed decision",
			Prompt: "Tell me about a decision you made that did not work out. How did you recognize it, respond, and change your approach afterward?",
			Topic:  "failure", Competency: "self-awareness and learning",
		},
	},
	{
		Question: Question{
			ID: "coding-alert-window", Track: TrackCoding, Title: "Repeated alert within a window",
			Prompt: "Given a time-ordered list of alert keys and a window size k, return the first key that appears twice within at most k positions. Return an empty string if none exists.",
			Topic:  "arrays", Difficulty: DifficultyEasy,
			Examples:    []string{`alerts = ["db", "api", "cache", "api"], k = 2 → "api"`, `alerts = ["a", "b", "a"], k = 1 → ""`},
			Constraints: []string{"0 ≤ len(alerts) ≤ 100,000", "0 ≤ k ≤ len(alerts)", "alert keys are non-empty strings"},
		},
		Hints: []string{
			"What information about each key would let you decide whether its latest occurrence is close enough?",
			"Store the most recent index for each key while scanning once from left to right.",
			"At index i, compare i with the stored index before updating that key's latest index.",
		},
	},
	{
		Question: Question{
			ID: "coding-deploy-windows", Track: TrackCoding, Title: "Merge deploy windows",
			Prompt: "Given maintenance windows as inclusive [start, end] integer pairs, merge every overlapping or touching window and return the minimal sorted set of windows.",
			Topic:  "intervals", Difficulty: DifficultyMedium,
			Examples:    []string{"[[1, 3], [3, 5], [8, 10]] → [[1, 5], [8, 10]]", "[[9, 12], [1, 2], [2, 4]] → [[1, 4], [9, 12]]"},
			Constraints: []string{"0 ≤ number of windows ≤ 100,000", "start ≤ end", "inputs are not guaranteed to be sorted"},
		},
		Hints: []string{
			"What ordering would make it possible to decide whether each new interval belongs with the previous result?",
			"Sort by start time, then compare each interval with the end of the last merged interval.",
			"Because touching windows merge, start <= lastEnd is the merge condition.",
		},
	},
	{
		Question: Question{
			ID: "coding-service-order", Track: TrackCoding, Title: "Safe service rollout order",
			Prompt: "You are given service names and dependency pairs [service, dependency]. Return one valid rollout order where every dependency appears before its service, or an empty list if no valid order exists.",
			Topic:  "graphs", Difficulty: DifficultyMedium,
			Examples:    []string{`services = ["api", "db", "worker"], dependencies = [["api", "db"], ["worker", "db"]] → ["db", "api", "worker"]`, `dependencies = [["a", "b"], ["b", "a"]] → []`},
			Constraints: []string{"service names are unique", "a dependency may be repeated in the input", "all names in dependencies appear in services"},
		},
		Hints: []string{
			"What graph property tells you a node is currently safe to emit?",
			"Track each service's in-degree and process zero-in-degree services with a queue.",
			"If the emitted count is smaller than the service count, the remaining graph contains a cycle.",
		},
	},
	{
		Question: Question{
			ID: "coding-log-hops", Track: TrackCoding, Title: "Shortest path through log links",
			Prompt: "Each log event may link to other event IDs. Given the adjacency list, a start ID, and a target ID, return the fewest links needed to reach the target, or -1 if it is unreachable.",
			Topic:  "graphs", Difficulty: DifficultyMedium,
			Examples:    []string{`links = {"a":["b","c"], "b":["d"], "c":[], "d":[]}, start = "a", target = "d" → 2`, `start = "c", target = "a" → -1`},
			Constraints: []string{"the graph may contain cycles", "event IDs are strings", "start and target may be equal"},
		},
		Hints: []string{
			"Which traversal discovers an unweighted graph in increasing path length?",
			"Use breadth-first search and mark a node visited when it enters the queue.",
			"Store a distance with each queued node; the first visit to the target is optimal.",
		},
	},
	{
		Question: Question{
			ID: "coding-shard-capacity", Track: TrackCoding, Title: "Minimum shard capacity",
			Prompt: "Requests must stay in order and be split across at most d daily shards. Find the minimum shard capacity that can process all request weights within d days.",
			Topic:  "binary search", Difficulty: DifficultyMedium,
			Examples:    []string{"weights = [3, 2, 2, 4, 1, 4], d = 3 → 6", "weights = [5, 1, 1], d = 2 → 5"},
			Constraints: []string{"1 ≤ len(weights) ≤ 100,000", "weights are positive integers", "1 ≤ d ≤ len(weights)"},
		},
		Hints: []string{
			"Can you efficiently answer whether a proposed capacity is sufficient?",
			"Greedily simulate days for a capacity, then binary-search the smallest feasible capacity.",
			"The search range starts at max(weights) and ends at sum(weights).",
		},
	},
	{
		Question: Question{
			ID: "coding-cache-policy", Track: TrackCoding, Title: "Least-recently-used cache",
			Prompt: "Design a fixed-capacity cache supporting get(key) and put(key, value) in O(1) average time while evicting the least recently used key when full. Explain the data structures and edge cases.",
			Topic:  "design", Difficulty: DifficultyHard,
			Examples:    []string{"capacity 2; put(a,1), put(b,2), get(a), put(c,3) evicts b"},
			Constraints: []string{"capacity is at least 1", "get refreshes recency", "updating an existing key refreshes recency"},
		},
		Hints: []string{
			"One structure can provide O(1) lookup, but what structure can also move and evict entries in O(1)?",
			"Combine a hash map with a doubly linked list ordered by recency.",
			"Map keys to list nodes; move reads and updates to the front, and evict from the tail.",
		},
	},
}

func publicQuestion(value bankQuestion) Question {
	result := value.Question
	result.Examples = append([]string(nil), value.Examples...)
	result.Constraints = append([]string(nil), value.Constraints...)
	if result.Examples == nil {
		result.Examples = []string{}
	}
	if result.Constraints == nil {
		result.Constraints = []string{}
	}
	return result
}

func matchesTopics(question bankQuestion, topics []string) bool {
	if len(topics) == 0 {
		return true
	}
	haystack := strings.ToLower(question.Topic + " " + question.Competency + " " + question.Title)
	for _, topic := range topics {
		if strings.Contains(haystack, strings.ToLower(topic)) {
			return true
		}
	}
	return false
}

func bankQuestionByID(id string) (bankQuestion, bool) {
	for _, question := range questionBank {
		if question.ID == id {
			return question, true
		}
	}
	return bankQuestion{}, false
}
