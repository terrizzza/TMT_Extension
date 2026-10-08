// Carpeta de dos tonos al estilo del Explorador de Windows 11
const FolderIcon = ({ size = 64, open = false, className }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    style={{ flexShrink: 0 }}
  >
    <path
      d="M4 14a4 4 0 0 1 4-4h14.5a4 4 0 0 1 2.9 1.2l3.1 3.3a3 3 0 0 0 2.2.9H56a4 4 0 0 1 4 4v33a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V14z"
      fill="#e9a825"
    />
    <path
      d={open ? "M2 28a3 3 0 0 1 3-3h54a3 3 0 0 1 3 3.4l-3.2 24A4 4 0 0 1 54.8 56H9.2a4 4 0 0 1-4-3.6L2 28z" : "M4 25a3 3 0 0 1 3-3h50a3 3 0 0 1 3 3v28a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V25z"}
      fill="#ffd45e"
    />
    <path d="M4 25a3 3 0 0 1 3-3h50a3 3 0 0 1 3 3v1.5H4V25z" fill="#ffe08a" />
  </svg>
);

export default FolderIcon;
