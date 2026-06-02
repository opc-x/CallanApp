export function isDevToolsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NEXT_PUBLIC_DEV_TOOLS === "true"
  );
}

export function isDevBypassAuth(): boolean {
  return process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";
}
