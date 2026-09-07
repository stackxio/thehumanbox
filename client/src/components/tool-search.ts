import { SANDBOX_CATEGORIES } from '../simulation/sandbox'

export function searchWorldTools(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return SANDBOX_CATEGORIES.flatMap((category) =>
    category.tools.map((tool) => ({ category: category.label, tool })),
  ).filter(({ category, tool }) =>
    words.every((word) => `${category} ${tool.label} ${tool.id}`.toLowerCase().includes(word)),
  )
}
