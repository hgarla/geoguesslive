import * as React from "react"

interface CardProps {
  className?: string;
  children?: React.ReactNode;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  function Card({ className = '', children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={`rounded-lg border bg-white p-4 shadow ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

interface CardContentProps {
  className?: string;
  children?: React.ReactNode;
}

const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  function CardContent({ className = '', children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={`p-6 pt-0 ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  }
)

export { Card, CardContent }