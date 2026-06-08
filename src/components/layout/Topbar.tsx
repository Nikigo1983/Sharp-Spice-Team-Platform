import { TopbarClient, type TopbarClientProps } from "./TopbarClient";

export type TopbarProps = TopbarClientProps;

export function Topbar(props: TopbarProps) {
  return <TopbarClient {...props} />;
}
