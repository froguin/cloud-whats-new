import DOMPurify from 'dompurify'; // XSS 방지를 위한 라이브러리

function UpdateItem({ update }) {
  return (
    <div className="update-item">
      <h2>{update.title}</h2>
      <div className="metadata">
        <span>{update.date}</span>
        <span>{update.category}</span>
      </div>
      <div 
        dangerouslySetInnerHTML={{ 
          __html: DOMPurify.sanitize(update.description) 
        }} 
      />
    </div>
  );
} 