import { Link } from "react-router-dom";
import { TicketForm } from "@/components/tickets/ticket-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { ArrowLeft, Ticket } from "lucide-react";

export default function NewTicketPage() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto animate-power-on">
      {/* Back button */}
      <div>
        <Link
          to={ROUTES.TICKETS}
          className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Tickets
        </Link>
        <div className="flex items-center gap-2">
          <Ticket className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold font-mono">Create Support Ticket</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Open a new support ticket on behalf of a customer or for an internal issue.
        </p>
      </div>

      <Card className="border-2 border-outline">
        <CardHeader>
          <CardTitle className="text-base font-mono">Ticket Information</CardTitle>
          <CardDescription>
            Provide details about the issue. Staff members can reply and track status once created.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TicketForm />
        </CardContent>
      </Card>
    </div>
  );
}
