export class SheetOrderNotFoundError extends Error {
  constructor(column: string, value: string) {
    super(`No sheet row was found with ${column}="${value}".`);
    this.name = SheetOrderNotFoundError.name;
  }
}
