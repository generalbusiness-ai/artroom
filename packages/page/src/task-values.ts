/** The supported Create issue intent: its title states the work to complete. */
export function issueTaskValues(typed: Record<string, string>): Record<string, string> {
  return { ...typed, conditions: JSON.stringify([typed["title"] ?? ""]) };
}
