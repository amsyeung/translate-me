import { motion } from 'motion/react'

export default function LoadingSpinner() {
  return (
    <motion.div
      variants={{
        pulse: {
          transition: {
            staggerChildren: -0.2,
            staggerDirection: -1,
          },
        },
      }}
      animate="pulse"
      className="absolute left-1 top-4 flex gap-1"
    >
      {Array.from({ length: 3 }).map((_, i) => (
        <motion.div
          key={i}
          className="w-2 h-2 rounded-full bg-[#1f1f1f]"
          variants={{
            pulse: {
              scale: [0.8, 1.1, 0.8],
              transition: {
                duration: 1.2,
                repeat: Infinity,
                ease: 'easeInOut',
              },
            },
          }}
        />
      ))}
    </motion.div>
  )
}
