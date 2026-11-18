/** Renders JSON-LD. Characters that could break out of the script tag are escaped. */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
  const safe = json.split(String.fromCharCode(0x2028)).join("\\u2028").split(String.fromCharCode(0x2029)).join("\\u2029");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safe }} />;
}
