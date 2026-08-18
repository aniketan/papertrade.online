export interface ChargeBreakdown {
  brokerage: number;
  exchange: number;
  sebi: number;
  stt: number;
  stamp: number;
  ipft: number;
  gst: number;
  total: number;
}

const BROKERAGE_PER_ORDER = 20;
const STT_ON_SELL_PREMIUM = 0.0015;
const STAMP_DUTY_ON_BUY = 0.00003;
const NSE_OPTION_EXCHANGE_CHARGE = 0.0003503;
const SEBI_TURNOVER_CHARGE = 0.000001;
const IPFT_CHARGE = 0.000005;
const GST = 0.18;

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function optionRoundTripCharges(buyPrice: number, sellPrice: number, quantity: number): ChargeBreakdown {
  const buyTurnover = buyPrice * quantity;
  const sellTurnover = sellPrice * quantity;
  const totalTurnover = buyTurnover + sellTurnover;

  const brokerage = BROKERAGE_PER_ORDER * 2;
  const exchange = totalTurnover * NSE_OPTION_EXCHANGE_CHARGE;
  const sebi = totalTurnover * SEBI_TURNOVER_CHARGE;
  const ipft = totalTurnover * IPFT_CHARGE;
  const stt = sellTurnover * STT_ON_SELL_PREMIUM;
  const stamp = buyTurnover * STAMP_DUTY_ON_BUY;
  const gst = (brokerage + exchange + sebi + ipft) * GST;
  const total = brokerage + exchange + sebi + ipft + stt + stamp + gst;

  return {
    brokerage: money(brokerage),
    exchange: money(exchange),
    sebi: money(sebi),
    stt: money(stt),
    stamp: money(stamp),
    ipft: money(ipft),
    gst: money(gst),
    total: money(total)
  };
}

export function optionEntryRequirement(buyPrice: number, quantity: number): { premiumValue: number; entryCharges: number; required: number } {
  const turnover = buyPrice * quantity;
  const brokerage = BROKERAGE_PER_ORDER;
  const exchange = turnover * NSE_OPTION_EXCHANGE_CHARGE;
  const sebi = turnover * SEBI_TURNOVER_CHARGE;
  const ipft = turnover * IPFT_CHARGE;
  const stamp = turnover * STAMP_DUTY_ON_BUY;
  const gst = (brokerage + exchange + sebi + ipft) * GST;
  const entryCharges = brokerage + exchange + sebi + ipft + stamp + gst;

  return {
    premiumValue: money(turnover),
    entryCharges: money(entryCharges),
    required: Math.ceil(turnover + entryCharges)
  };
}
