export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container flex flex-1 items-center justify-center">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
