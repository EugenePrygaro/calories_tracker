import { motion, useSpring, useTransform } from 'framer-motion'
import { useEffect } from 'react'

interface AnimatedNumberProps {
  value: number
  /** Форматування на кожному кадрі (наприклад, kcal з lib/format). Має бути стабільною функцією. */
  format: (n: number) => string
  className?: string
}

/** Число, що плавно «докручується» до нового значення (і з нуля при появі). */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const spring = useSpring(0, { stiffness: 90, damping: 20, mass: 0.8 })
  const text = useTransform(spring, (v) => format(v))

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return <motion.span className={className}>{text}</motion.span>
}
