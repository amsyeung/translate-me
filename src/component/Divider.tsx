export default function Divider({
  onClickAction,
  allowToggle,
  withButton = false,
}: {
  onClickAction?: () => void
  allowToggle?: boolean
  withButton?: boolean
}) {
  return (
    <div className="flex items-center">
      <div aria-hidden="true" className="w-full border-t border-gray-300 dark:border-white/15" />
      {withButton && (
        <div className="relative flex justify-center">
          <button
            disabled={!allowToggle}
            onClick={onClickAction}
            type="button"
            className="inline-flex items-center gap-x-1.5 rounded-full bg-white px-2 py-1.5 rotate-90 text-sm font-semibold whitespace-nowrap text-gray-900 shadow-xs inset-ring inset-ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:shadow-none dark:inset-ring-white/5 dark:hover:bg-white/20"
          >
            <img className={`${!allowToggle && 'invert-60'}`} src="shuffle.png" width={40} height={40} alt="shuffle" />
          </button>
        </div>
      )}
      <div aria-hidden="true" className="w-full border-t border-gray-300 dark:border-white/10" />
    </div>
  )
}
