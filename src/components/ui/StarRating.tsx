'use client'

// Composant de notation par étoiles — lisible ou interactif
interface StarRatingProps {
  value: number | null
  onChange?: (rating: number) => void
  readOnly?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function StarRating({
  value,
  onChange,
  readOnly = false,
  size = 'md',
}: StarRatingProps) {
  const rating = value ?? 0

  const sizeClasses = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
  }

  const handleClick = (star: number) => {
    if (!readOnly && onChange) {
      // Cliquer sur la même étoile remet à 0
      onChange(star === rating ? 0 : star)
    }
  }

  return (
    <div className="flex gap-0.5" aria-label={`Note : ${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => handleClick(star)}
          disabled={readOnly}
          className={`
            ${sizeClasses[size]}
            leading-none
            ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110 transition-transform'}
            focus:outline-none
          `}
          aria-label={`${star} étoile${star > 1 ? 's' : ''}`}
        >
          {star <= rating ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}
