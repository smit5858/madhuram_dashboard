// The selectable courier company list itself now comes from the backend-managed Courier
// Companies module (see services/courierCompany.service.ts) — this constant only marks the
// "type your own" option in that dropdown, which writes straight into Courier.courierName
// without persisting a new CourierCompany row.
export const COURIER_COMPANY_OTHER = "Other";
