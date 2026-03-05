// ─── Auth ────────────────────────────────────────────────────────
export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
  };
}

// ─── User ────────────────────────────────────────────────────────
export interface User {
  id: number;
  name: string;
  email: string;
  role_id: number | null;
  role?: Role;
  status: 'ACTIVE' | 'INACTIVE';
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserPayload {
  name: string;
  email: string;
  password?: string;
  password_confirmation?: string;
  role_id: number;
  status?: 'ACTIVE' | 'INACTIVE';
}

// ─── Role ────────────────────────────────────────────────────────
export interface Role {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  permissions?: Permission[];
  created_at: string;
  updated_at: string;
}

export interface RolePayload {
  name: string;
  display_name: string;
  description?: string;
}

// ─── Permission ──────────────────────────────────────────────────
export interface Permission {
  id: number;
  name: string;
  display_name: string;
  description: string | null;
  group: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Category ────────────────────────────────────────────────────
export interface Category {
  id: number;
  code: string | null;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryPayload {
  code?: string;
  name: string;
  description?: string;
  is_active?: boolean;
}

// ─── Location ────────────────────────────────────────────────────
export interface Location {
  id: number;
  name: string;
  code: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LocationPayload {
  name: string;
  code: string;
  description?: string;
  is_active?: boolean;
}

// ─── Product ─────────────────────────────────────────────────────
export interface Product {
  id: number;
  product_code: string;
  name: string;
  category_id: number;
  category?: Category;
  counting_unit: string;
  length: number | null;
  length_unit: string;
  thickness: number | null;
  thickness_unit: string;
  width: string | null;
  steel_type: string | null;
  side_steel_type: 'HIDE' | 'SHOW' | 'NONE';
  size_type: 'STANDARD' | 'CUSTOM';
  custom_note: string | null;
  stock_min: number;
  stock_max: number;
  default_location_id: number | null;
  default_location?: Location;
  barcode: string | null;
  is_active: boolean;
  stock_count?: number;
  reserved_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductPayload {
  product_code: string;
  name: string;
  category_id: number;
  counting_unit?: string;
  length?: number | null;
  length_unit?: string;
  thickness?: number | null;
  thickness_unit?: string;
  width?: string | null;
  steel_type?: string;
  side_steel_type: 'HIDE' | 'SHOW' | 'NONE';
  size_type: 'STANDARD' | 'CUSTOM';
  custom_note?: string;
  stock_min: number;
  stock_max: number;
  is_active?: boolean;
}

// ─── Pack (แพสินค้า) ─────────────────────────────────────────────
export interface PackItem {
  id: number;
  pack_id: number;
  product_id: number;
  product?: Product;
  quantity: number;
  created_at: string;
  updated_at: string;
}

export interface Pack {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  items?: PackItem[];
  items_count?: number;
  created_at: string;
  updated_at: string;
}

export interface PackItemPayload {
  product_id: number;
  quantity: number;
}

export interface PackPayload {
  code: string;
  name: string;
  description?: string;
  is_active?: boolean;
  items: PackItemPayload[];
}

// ─── Inventory (คลังสินค้า) ───────────────────────────────────────
export interface Inventory {
  id: number;
  serial_number: string;
  product_id: number;
  product?: Product;
  location_id: number | null;
  location?: Location;
  production_order_id: number | null;
  status: 'PENDING' | 'IN_STOCK' | 'SOLD' | 'DAMAGED' | 'SCRAPPED';
  condition: 'GOOD' | 'DAMAGED';
  note: string | null;
  received_at: string | null;
  last_movement_at: string | null;
  label_printed_at: string | null;
  label_printed_by: number | null;
  label_verified_at: string | null;
  label_verified_by: number | null;
  label_print_count: number;
  claim_return?: {
    claim_code: string;
    claim_id: number;
    note: string;
    date: string;
  } | null;
  last_adjustment?: {
    note: string;
    by: string;
    date: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface InventorySummary {
  id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  category_name: string;
  stock_min: number;
  stock_max: number;
  in_stock_count: number;
  damaged_count: number;
  sold_count: number;
  total_count: number;
  reserved_count: number;
}

// ─── Production Order (ใบสั่งผลิต) ────────────────────────────────
export interface ProductionOrderItem {
  id: number;
  production_order_id: number;
  product_id: number;
  product?: Product;
  planned_qty: number;
  good_qty: number;
  damaged_qty: number;
  verified_qty: number;
  received_qty: number;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrder {
  id: number;
  order_number: string;
  pack_id: number;
  pack?: Pack;
  quantity: number;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  note: string | null;
  created_by: number;
  creator?: { id: number; name: string };
  confirmed_by: number | null;
  confirmer?: { id: number; name: string };
  confirmed_at: string | null;
  completed_at: string | null;
  items?: ProductionOrderItem[];
  serials_count?: number;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrderPayload {
  pack_id: number;
  quantity: number;
  note?: string;
  location_id?: number;
}

export interface ReceiveItemPayload {
  production_order_item_id: number;
  damaged_qty: number;
}

export interface ReceivePayload {
  items: ReceiveItemPayload[];
  note?: string;
}

export interface ProductionSerial {
  id: number;
  serial_number: string;
  product: { id: number; product_code: string; name: string };
  location: { id: number; name: string } | null;
  condition: 'GOOD' | 'DAMAGED';
  status: string;
  received_at: string | null;
}

export interface InventoryAlert {
  low_stock: Array<{
    product_id: number;
    product_code: string;
    product_name: string;
    stock_min: number;
    current_stock: number;
  }>;
  no_movement: Array<Inventory>;
  long_storage: Array<Inventory>;
}

// ─── Label Printing (ปริ้น Barcode) ──────────────────────────────
export interface LabelPrintLog {
  id: number;
  inventory_id: number;
  serial_number: string;
  print_type: 'FIRST' | 'REPRINT';
  paper_size: string;
  reprint_reason: string | null;
  reprint_request_id: number | null;
  printed_by: number;
  printer?: { id: number; name: string };
  inventory?: Inventory;
  printed_at: string;
  created_at: string;
}

export interface LabelReprintRequest {
  id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PRINTED';
  reason: string;
  reject_reason: string | null;
  requested_by: number;
  requester?: { id: number; name: string };
  approved_by: number | null;
  approver?: { id: number; name: string } | null;
  approved_at: string | null;
  production_order_id: number | null;
  production_order?: { id: number; order_number: string } | null;
  inventories?: Inventory[];
  inventories_count?: number;
  created_at: string;
  updated_at: string;
}

export interface LabelStats {
  total_serials: number;
  never_printed: number;
  printed_not_verified: number;
  verified: number;
  pending_reprints: number;
}

// Production Order with label counts (for label page)
export interface ProductionOrderLabelInfo {
  id: number;
  order_number: string;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  quantity: number;
  pack?: { id: number; code: string; name: string };
  creator?: { id: number; name: string };
  total_serials: number;
  printed_serials: number;
  verified_serials: number;
  created_at: string;
  completed_at: string | null;
}

export interface ProductionOrderSerialsMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface ProductionOrderSerialsResponse {
  success: boolean;
  data: Inventory[];
  meta: ProductionOrderSerialsMeta;
  po: {
    id: number;
    order_number: string;
    status: string;
    total_serials: number;
    printed: number;
    verified: number;
  };
}

// ─── API Response ────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
  };
}

export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}

// ─── Stock Count (ตรวจนับสต๊อก) ──────────────────────────────────
export type StockCountType = 'FULL' | 'CYCLE' | 'SPOT';
export type StockCountStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED' | 'CANCELLED';
export type StockCountResolution = 'PENDING' | 'MATCHED' | 'ADJUSTED' | 'IGNORED' | 'WRITE_OFF' | 'KEEP';

export interface StockCount {
  id: number;
  code: string;
  name: string;
  type: StockCountType;
  status: StockCountStatus;
  filter_category_ids: number[] | null;
  filter_location_ids: number[] | null;
  filter_product_ids: number[] | null;
  note: string | null;
  created_by: number;
  creator?: { id: number; name: string };
  started_at: string | null;
  completed_at: string | null;
  approved_by: number | null;
  approver?: { id: number; name: string } | null;
  approved_at: string | null;
  items_count?: number;
  scans_count?: number;
  items?: StockCountItem[];
  created_at: string;
  updated_at: string;
}

export interface StockCountItem {
  id: number;
  stock_count_id: number;
  product_id: number;
  product?: { id: number; product_code: string; name: string };
  expected_qty: number;
  scanned_qty: number;
  difference: number;
  resolution: StockCountResolution;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockCountScan {
  id: number;
  stock_count_id: number;
  serial_number: string;
  product_id: number | null;
  product?: { id: number; product_code: string; name: string } | null;
  inventory_id: number | null;
  inventory?: { id: number; status: string; location_id: number } | null;
  pda_token_id: number | null;
  is_expected: boolean;
  is_duplicate: boolean;
  resolution: string | null;
  resolution_product_id: number | null;
  resolution_product?: { id: number; product_code: string; name: string } | null;
  resolution_location_id: number | null;
  scanned_at: string;
  created_at: string;
}

export interface StockCountStats {
  total_expected: number;
  total_scanned: number;
  total_scans: number;
  matched: number;
  over: number;
  under: number;
  unexpected_scans: number;
}

export interface StockCountUnresolved {
  missing_serials: number;
  unexpected_scans: number;
  total: number;
}

export interface StockCountPayload {
  name: string;
  type: StockCountType;
  note?: string;
  filter_category_ids?: number[];
  filter_location_ids?: number[];
  filter_product_ids?: number[];
}

export interface StockCountAdjustment {
  item_id: number;
  action: 'ADJUST' | 'IGNORE';
  note?: string;
}

export interface StockCountResolveSerialPayload {
  inventory_id: number;
  action: 'WRITE_OFF' | 'KEEP';
}

export interface StockCountResolveScanPayload {
  scan_id: number;
  action: 'IMPORT' | 'IGNORE';
  product_id?: number;
  location_id?: number;
}

// ─── Stock Deductions (ตัดสต๊อก) ─────────────────────────────────
export type StockDeductionType = 'SOLD' | 'LOST' | 'DAMAGED' | 'OTHER';
export type StockDeductionStatus = 'DRAFT' | 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'APPROVED' | 'CANCELLED';

export interface StockDeduction {
  id: number;
  code: string;
  type: StockDeductionType;
  status: StockDeductionStatus;
  status_label?: string;
  customer_name: string | null;
  reference_doc: string | null;
  reason: string | null;
  note: string | null;
  pda_token: string | null;
  created_by: number;
  creator?: { id: number; name: string };
  approved_by: number | null;
  approver?: { id: number; name: string } | null;
  approved_at: string | null;
  lines_count?: number;
  scans_count?: number;
  lines_sum_quantity?: number;
  lines?: StockDeductionLine[];
  scans?: StockDeductionScan[];
  created_at: string;
  updated_at: string;
}

export interface StockDeductionLine {
  id: number;
  stock_deduction_id: number;
  product_id: number;
  quantity: number;
  scanned_qty: number;
  note: string | null;
  product?: { id: number; product_code: string; name: string; counting_unit?: string; length?: number; thickness?: number; width?: number };
  scans?: StockDeductionScan[];
  created_at: string;
  updated_at: string;
}

export interface StockDeductionScan {
  id: number;
  stock_deduction_id: number;
  stock_deduction_line_id: number;
  inventory_id: number;
  serial_number: string;
  pda_token_id: number | null;
  scanned_at: string;
  inventory?: {
    id: number;
    serial_number: string;
    status: string;
    condition: string;
    location_id: number;
    location?: { id: number; name: string; code: string };
    product?: { id: number; product_code: string; name: string };
  };
  created_at: string;
  updated_at: string;
}

export interface StockDeductionPayload {
  type: StockDeductionType;
  customer_name?: string;
  reference_doc?: string;
  reason?: string;
  note?: string;
  lines: { product_id: number; quantity: number; note?: string }[];
}

// ─── Claims (เคลมสินค้า) ──────────────────────────────────────────
export type ClaimType = 'RETURN' | 'TRANSPORT_DAMAGE' | 'DEFECT' | 'WRONG_SPEC' | 'OTHER';
export type ClaimStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type ClaimResolution = 'RETURN_STOCK' | 'RETURN_DAMAGED' | 'REPLACE' | 'REFUND' | 'CREDIT_NOTE';

export interface Claim {
  id: number;
  code: string;
  type: ClaimType;
  status: ClaimStatus;
  resolution: ClaimResolution | null;
  customer_name: string | null;
  reference_doc: string | null;
  stock_deduction_id: number | null;
  stock_deduction?: { id: number; code: string } | null;
  reason: string | null;
  note: string | null;
  pda_token: string | null;
  reject_reason: string | null;
  created_by: number;
  creator?: { id: number; name: string };
  approved_by: number | null;
  approver?: { id: number; name: string } | null;
  approved_at: string | null;
  lines_count?: number;
  lines_sum_quantity?: number;
  lines?: ClaimLine[];
  created_at: string;
  updated_at: string;
}

export interface ClaimLine {
  id: number;
  claim_id: number;
  product_id: number;
  inventory_id: number | null;
  serial_number: string | null;
  quantity: number;
  resolution: ClaimResolution | null;
  note: string | null;
  product?: { id: number; product_code: string; name: string; counting_unit?: string };
  inventory?: {
    id: number;
    serial_number: string;
    status: string;
    condition: string;
    location_id: number;
    location?: { id: number; name: string; code: string };
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimPayload {
  type: ClaimType;
  customer_name?: string;
  reference_doc?: string;
  stock_deduction_id?: number | null;
  reason?: string;
  note?: string;
  lines: {
    serial_number: string;
    resolution?: ClaimResolution | null;
    note?: string;
  }[];
}

export interface ClaimSearchItem {
  inventory_id: number;
  product_id: number;
  product_code: string;
  product_name: string;
  serial_number: string;
  status: string;
  condition: string;
  location: string | null;
  counting_unit: string;
}
