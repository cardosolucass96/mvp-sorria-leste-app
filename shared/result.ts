export interface ServiceResult<T = unknown> { body: T; status: number; }
export function serviceResult<T>(body: T, options: { status?: number } = {}): ServiceResult<T> {
  return { body, status: options.status ?? 200 };
}
