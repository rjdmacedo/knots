import packageJson from '../../package.json'

export function Footer() {
  return (
    <footer className="border-t border-border bg-background/50 backdrop-blur-xs">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-center text-sm text-muted-foreground">
          <span>Version {packageJson.version}</span>
        </div>
      </div>
    </footer>
  )
}
