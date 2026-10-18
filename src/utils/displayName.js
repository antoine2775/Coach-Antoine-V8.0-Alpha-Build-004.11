export function displayName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  return name ? name[0].toLocaleUpperCase("fr-FR") + name.slice(1) : "";
}
