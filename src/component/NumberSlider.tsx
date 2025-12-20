'use client'

import { AnimateNumber } from 'motion-plus/react'
import { useMotionValue, useSpring, useVelocity } from 'motion/react'
import { Slider } from 'radix-ui'
import { useEffect, useState } from 'react'

export default function NumberSlider({ min = 0.5, max = 2, initialValue = 1.2 }) {
  const [value, setValue] = useState([initialValue])

  const scaled = useMotionValue(scale(value[0]))
  const velocity = useVelocity(scaled)
  const rotate = useSpring(velocity)

  useEffect(() => {
    scaled.set(scale(value[0]))
  }, [value, scaled])

  return (
    <form>
      <Slider.Root className="slider" onValueChange={setValue} defaultValue={[1.2]} min={min} max={max} step={0.1}>
        <Slider.Track className="track">
          <Slider.Range className="range" />
        </Slider.Track>
        <Slider.Thumb className="thumb" aria-label="Volume">
          <div className="thumb-text-container">
            <AnimateNumber
              transition={{ duration: 0.2, ease: 'easeOut' }}
              locales="en-US"
              className="thumb-text"
              style={{ originX: 0.5, originY: 1.5, rotate }}
            >
              {value as any}
            </AnimateNumber>
          </div>
        </Slider.Thumb>
      </Slider.Root>
      <StyleSheet />
    </form>
  )
}

/**
 * ==============   Utils   ================
 */

function scale(value: number, scaleBy: number = -0.1) {
  return value * scaleBy
}

/**
 * ==============   Styles   ================
 */

function StyleSheet() {
  return (
    <style>{`
        .slider {
            position: relative;
            display: flex;
            align-items: center;
            user-select: none;
            touch-action: none;
            width: 200px;
            height: 20px;
        }

        .track {
            background-color: #eee;
            position: relative;
            flex-grow: 1;
            border-radius: 9999px;
            height: 3px;
        }

        .range {
            position: absolute;
            background-color: #36a5d1ff;
            border-radius: 9999px;
            height: 100%;
        }

        .thumb {
            display: block;
            width: 15px;
            height: 15px;
            background-color: #36a5d1ff;
            border-radius: 10px;
        }
            
        .thumb:focus {
            outline: none;
            box-shadow: 0 0 0 2px #36a5d1ff;
        }

        .thumb-text-container {
            position: absolute;
            top: calc(-100% - 12px);
            left: 50%;
            width: 1px;
            display: flex;
            align-items: center;
            justify-content: center;

        }

        .thumb-text {
            background-color: #36a5d1ff;
            color: #f5f5f5;
            padding: 2px 4px;
            border-radius: 4px;
        }
    `}</style>
  )
}
