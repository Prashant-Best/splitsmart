import type { Category } from '@domain';
import {
  BedDouble,
  Bike,
  House,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingBasket,
  Ticket,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export { CATEGORIES, CATEGORY_LABELS } from '@domain';

// Categories are told apart by icon and name, not by color: ten hues would exceed what a
// colorblind-safe categorical palette can carry.
export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  food: UtensilsCrossed,
  groceries: ShoppingBasket,
  travel: Plane,
  transport: Bike,
  stay: BedDouble,
  rent: House,
  utilities: Zap,
  entertainment: Ticket,
  shopping: ShoppingBag,
  other: Receipt,
};
