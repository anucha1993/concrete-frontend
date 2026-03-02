'use client';

import { useParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import LabelDesigner from '@/components/label-designer/LabelDesigner';

export default function EditLabelTemplatePage() {
  const params = useParams();
  const templateId = Number(params?.id);

  return (
    <AuthGuard permission="manage_production">
      <LabelDesigner templateId={templateId} />
    </AuthGuard>
  );
}
