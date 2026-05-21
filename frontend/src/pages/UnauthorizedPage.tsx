import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function UnauthorizedPage() {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen gap-4 text-center p-8"
      data-testid="unauthorized-page"
    >
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <ShieldAlert size={28} className="text-destructive" />
      </div>
      <h1 className="text-2xl font-heading font-semibold">Access Denied</h1>
      <p className="text-muted-foreground max-w-sm">
        You don't have permission to access this page. Please contact your administrator.
      </p>
      <Button
        variant="outline"
        onClick={() => navigate(-1)}
        className="mt-2"
        data-testid="go-back-button"
      >
        <ArrowLeft size={16} className="mr-2" />
        Go Back
      </Button>
    </div>
  );
}
