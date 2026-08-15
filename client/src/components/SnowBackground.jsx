function SnowBackground() {
  const snowflakes = Array.from({ length: 40 }, (_, i) => i);
  const sparkles = Array.from({ length: 25 }, (_, i) => i);

  return (
    <div className="winter-bg">
      {snowflakes.map((i) => (
        <span
          key={`snow-${i}`}
          className="snowflake"
          style={{
            left: `${Math.random() * 100}%`,
            animationDuration: `${8 + Math.random() * 12}s`,
            animationDelay: `${Math.random() * 10}s`,
            width: `${2 + Math.random() * 4}px`,
            height: `${2 + Math.random() * 4}px`,
            opacity: 0.3 + Math.random() * 0.5,
          }}
        />
      ))}
      {sparkles.map((i) => (
        <span
          key={`sparkle-${i}`}
          className="sparkle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDuration: `${2 + Math.random() * 3}s`,
            animationDelay: `${Math.random() * 5}s`,
          }}
        />
      ))}
    </div>
  );
}

export default SnowBackground;