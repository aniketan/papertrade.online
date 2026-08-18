export interface GrowwAuthInput {
  apiKey: string;
  totp: string;
}

export interface GrowwAccessToken {
  accessToken: string;
}

export async function getGrowwAccessToken(_: GrowwAuthInput): Promise<GrowwAccessToken> {
  throw new Error("Groww REST client is not implemented yet.");
}
