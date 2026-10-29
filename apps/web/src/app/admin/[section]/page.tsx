const SECTIONS = [
  "overview", "approvals", "registrations", "applications", "staff",
  "requests", "vip", "income", "support", "chat",
];

export function generateStaticParams() {
  return SECTIONS.map((section) => ({ section }));
}

export default async function AdminSection({ params }: PageProps<"/admin/[section]">) {
  const { section } = await params;
  return <h1 className="text-2xl font-extrabold capitalize">{section}</h1>;
}
