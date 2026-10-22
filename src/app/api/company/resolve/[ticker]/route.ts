import { NextResponse } from "next/server";
import { B3_UNIVERSE, type B3Asset } from "@/data/b3-universe";
import { resolveCvmCompanyByTicker } from "@/lib/cvm/company-resolver";
import { getYahooSecurityProfile } from "@/lib/market-data/yahoo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]{4}\d{1,2}$/.test(upper)) {
    return NextResponse.json({ asset: null, error: "Ticker inválido." }, { status: 400 });
  }

  const staticAsset = B3_UNIVERSE.find(asset => asset.ticker === upper);
  if (staticAsset?.hasCvmMapping) {
    return NextResponse.json({ asset: staticAsset, source: "catalog" });
  }

  const [cvm, yahoo] = await Promise.all([
    resolveCvmCompanyByTicker(upper),
    getYahooSecurityProfile(upper),
  ]);

  if (!cvm && !yahoo) {
    return NextResponse.json({ asset: staticAsset ?? null, source: staticAsset ? "catalog" : "not_found" });
  }

  const asset: B3Asset = {
    ticker: upper,
    companyName: cvm?.companyName ?? yahoo?.longName ?? yahoo?.shortName ?? staticAsset?.companyName ?? upper,
    tradingName: cvm?.tradingName ?? yahoo?.shortName ?? staticAsset?.tradingName ?? upper,
    sector: cvm?.sector ?? staticAsset?.sector ?? "Empresa listada",
    subsector: staticAsset?.subsector ?? "A classificar",
    assetType: staticAsset?.assetType ?? "stock",
    hasMockData: staticAsset?.hasMockData ?? false,
    hasCvmMapping: Boolean(cvm),
    coverageStatus: cvm ? "cvm_analysis" : (staticAsset?.coverageStatus ?? "quote_only"),
  };

  return NextResponse.json({
    asset,
    source: cvm ? cvm.resolutionSource : "yahoo",
    matchConfidence: cvm?.matchConfidence,
  });
}

