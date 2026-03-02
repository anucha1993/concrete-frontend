'use client';

import AuthGuard from '@/components/AuthGuard';
import LabelDesigner from '@/components/label-designer/LabelDesigner';

export default function CreateLabelTemplatePage() {
  return (
    <AuthGuard permission="manage_production">
      <LabelDesigner />
    </AuthGuard>
  );
}
