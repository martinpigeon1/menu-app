'use client'

import { Fragment } from 'react'
import { parseStepText } from '@/lib/scale'

interface StepTextProps {
  text: string
  selectedServings: number
  defaultServings: number
}

/**
 * Renders a recipe step, replacing [[N]] placeholders with the quantity scaled
 * to the selected serving size. Scaled quantities are emphasised so it's clear
 * which numbers adapt; Thermomix parameters (never wrapped) render as-is.
 */
export default function StepText({ text, selectedServings, defaultServings }: StepTextProps) {
  const segments = parseStepText(text, selectedServings, defaultServings)
  return (
    <>
      {segments.map((seg, i) =>
        seg.isQuantity ? (
          <span key={i} className="font-semibold text-green-700">
            {seg.text}
          </span>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        )
      )}
    </>
  )
}
