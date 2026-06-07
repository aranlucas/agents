import { Streamdown } from "streamdown";

export function Response({ text }: { text: string }) {
  return <Streamdown>{text}</Streamdown>;
}
