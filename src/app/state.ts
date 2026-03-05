export type FilterScope = 'all' | 'pinned' | 'category' | 'tag';

export interface DashboardFilter {
  scope: FilterScope;
  categoryId: string | null;
  tagId: string | null;
}
