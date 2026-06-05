import { linkifyUnwhelmText } from "@socialmedialite/shared";
import { Link } from "react-router-dom";

export function LinkifiedMessageText(props: {
  text: string;
  className?: string;
  /** Links on purple friend bubbles (higher contrast on accent fill). */
  tone?: "default" | "onAccent";
}) {
  const segments = linkifyUnwhelmText(props.text);
  const linkClass =
    props.tone === "onAccent"
      ? "font-medium underline decoration-white/70 text-white hover:text-violet-100"
      : "underline decoration-violet-500/60 text-violet-300 hover:text-violet-200";
  return (
    <span className={props.className}>
      {segments.map((seg, i) => {
        if (seg.type === "text") {
          return <span key={i}>{seg.value}</span>;
        }
        const className = linkClass;
        if (seg.href.startsWith("/")) {
          return (
            <Link key={i} to={seg.href} className={className} onClick={(e) => e.stopPropagation()}>
              {seg.label}
            </Link>
          );
        }
        return (
          <a
            key={i}
            href={seg.href}
            className={className}
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {seg.label}
          </a>
        );
      })}
    </span>
  );
}
