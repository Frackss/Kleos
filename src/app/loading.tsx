export default function Loading() {
  return (
    <main
      className="mx-auto max-w-6xl p-10"
      aria-label="Loading dashboard"
      aria-busy="true"
    >
      <div className="skeleton mb-8 h-10 w-60" />
      <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-36" />
        ))}
      </div>
      <div className="skeleton mt-6 h-96" />
    </main>
  );
}
