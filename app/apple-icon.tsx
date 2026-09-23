import { ImageResponse } from "next/og";
import { AppMark } from "@/app/components/AppMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppMark size={180} />, size);
}
