import { useParams } from "react-router-dom";
import CanvasEditor from "./_components/canvas-editor.tsx";

export default function CanvasPage() {
  const { locale } = useParams<{ locale?: string }>();

  return <CanvasEditor initialLocale={locale} />;
}
