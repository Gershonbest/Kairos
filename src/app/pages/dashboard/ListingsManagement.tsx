// Tenant product catalog management page.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Box, CheckCircle2, AlertTriangle, BadgeCheck, PackagePlus } from "lucide-react";

import { api, type ListingStatus } from "../../../lib/api/client";
import { queryKeys } from "../../../lib/queryClient";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { ImageUpload } from "../../components/forms/ImageUpload";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Textarea } from "../../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Checkbox } from "../../components/ui/checkbox";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorNote,
  PageHeader,
  PageShell,
} from "../../components/dashboard-ui";
import { resolveMediaUrl } from "../../../lib/media";

type ListingForm = {
  name: string;
  description: string;
  status: ListingStatus;
  imageUrl: string;
  active: boolean;
  serviceIds: string[];
};

const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  sold: "Sold",
  hidden: "Hidden",
};

const EMPTY_FORM: ListingForm = {
  name: "",
  description: "",
  status: "available",
  imageUrl: "",
  active: true,
  serviceIds: [],
};

export function ListingsManagement() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("create");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ListingStatus>("all");
  const [inspectionFilter, setInspectionFilter] = useState<"all" | "ready" | "needs_attention">("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<ListingForm>(EMPTY_FORM);

  const { data: listings = [], isPending: listingsLoading } = useQuery({
    queryKey: queryKeys.listings,
    queryFn: () => api.listListings(),
  });
  const { data: services = [] } = useQuery({
    queryKey: queryKeys.services,
    queryFn: () => api.listServices(),
  });

  const serviceOptions = useMemo(
    () => services.map((service) => ({ id: service.id, name: service.name })),
    [services]
  );

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.listings }),
      queryClient.invalidateQueries({ queryKey: queryKeys.services }),
    ]);
  }

  function openCreateTab() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setActiveTab("create");
  }

  function openEditTab(listingId: string) {
    const listing = listings.find((row) => row.id === listingId);
    if (!listing) return;
    setEditingId(listing.id);
    setForm({
      name: listing.name,
      description: listing.description ?? "",
      status: listing.status,
      imageUrl: listing.image_urls[0] ?? "",
      active: listing.active,
      serviceIds: listing.service_ids ?? [],
    });
    setError("");
    setActiveTab("create");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
        image_urls: form.imageUrl ? [form.imageUrl] : [],
        active: form.active,
        service_ids: form.serviceIds,
      };
      if (editingId) {
        await api.updateListing(editingId, payload);
      } else {
        await api.createListing(payload);
      }
      await refresh();
      setForm(EMPTY_FORM);
      setEditingId(null);
      setError("");
      setActiveTab("catalog");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save product.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(listingId: string) {
    setDeletingId(listingId);
    try {
      await api.deleteListing(listingId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete product.");
    } finally {
      setDeletingId(null);
    }
  }

  const listingInspectionRows = useMemo(
    () =>
      listings.map((listing) => {
        const linkedServices = serviceOptions
          .filter((service) => listing.service_ids.includes(service.id))
          .map((service) => service.name);
        const hasDescription = Boolean(listing.description?.trim());
        const hasImage = Boolean(listing.image_urls[0]);
        const inspectionScore = Number(hasDescription) + Number(hasImage) + Number(linkedServices.length > 0);
        return {
          listing,
          linkedServices,
          hasDescription,
          hasImage,
          inspectionScore,
          readyForPublic:
            listing.active && listing.status === "available" && hasDescription && hasImage && linkedServices.length > 0,
        };
      }),
    [listings, serviceOptions]
  );

  const filteredListings = useMemo(() => {
    return listings.filter((listing) => {
      const matchesSearch =
        !searchQuery.trim() ||
        listing.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (listing.description ?? "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || listing.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [listings, searchQuery, statusFilter]);

  const filteredInspectionRows = useMemo(() => {
    if (inspectionFilter === "all") return listingInspectionRows;
    if (inspectionFilter === "ready") return listingInspectionRows.filter((row) => row.readyForPublic);
    return listingInspectionRows.filter((row) => !row.readyForPublic);
  }, [inspectionFilter, listingInspectionRows]);

  return (
    <PageShell>
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Create inspectable product listings and link each one to bookable services."
        actions={
          <Button onClick={openCreateTab}>
            <PackagePlus className="mr-2 h-4 w-4" />
            Create product
          </Button>
        }
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      <Card className="border-dashed">
        <CardContent className="pt-6 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Services</span> are what customers are booking.
          <span className="mx-2">|</span>
          <span className="font-semibold text-foreground">Products</span> are the actual assets they select during that
          booking. Use the inspection tab to verify products are complete and publish-ready.
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="create">Create Product</TabsTrigger>
          <TabsTrigger value="catalog">Product Catalog</TabsTrigger>
          <TabsTrigger value="inspection">Inspection Board</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? "Edit Product Listing" : "Create Product Listing"}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="listing_name">Product Name</Label>
                  <Input
                    id="listing_name"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Toyota Corolla 2022 · Unit 14"
                    required
                    disabled={isSubmitting}
                  />
                </div>
                <div>
                  <Label htmlFor="listing_description">Product Description</Label>
                  <Textarea
                    id="listing_description"
                    rows={4}
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Include key condition notes, unique identifiers, and what this product represents."
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="listing_status">Product Status</Label>
                    <Select
                      value={form.status}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as ListingStatus }))}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger id="listing_status" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(LISTING_STATUS_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="mt-6 flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={form.active}
                      onCheckedChange={(next) => setForm((prev) => ({ ...prev, active: Boolean(next) }))}
                      disabled={isSubmitting}
                    />
                    Product is active for booking
                  </label>
                </div>
                <ImageUpload
                  label="Product image"
                  value={form.imageUrl}
                  onChange={(url) => setForm((prev) => ({ ...prev, imageUrl: url }))}
                  uploadKind="listing-image"
                  disabled={isSubmitting}
                />
                <div>
                  <Label>Bookable Services linked to this product</Label>
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {serviceOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Create services first, then link them here.
                      </p>
                    ) : (
                      serviceOptions.map((service) => (
                        <label key={service.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={form.serviceIds.includes(service.id)}
                            onCheckedChange={(next) =>
                              setForm((prev) => ({
                                ...prev,
                                serviceIds: next
                                  ? [...prev.serviceIds, service.id]
                                  : prev.serviceIds.filter((id) => id !== service.id),
                              }))
                            }
                            disabled={isSubmitting}
                          />
                          <span>{service.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" loading={isSubmitting} loadingLabel="Saving...">
                    {editingId ? "Save product changes" : "Create product"}
                  </Button>
                  {editingId && (
                    <Button type="button" variant="outline" onClick={openCreateTab} disabled={isSubmitting}>
                      Cancel edit
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="catalog">
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value as "all" | ListingStatus)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {Object.entries(LISTING_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}>
                  Reset filters
                </Button>
              </div>
            </CardContent>
          </Card>
          {listingsLoading ? (
            <CardGridSkeleton />
          ) : filteredListings.length === 0 ? (
            <EmptyState
              icon={Box}
              title={listings.length === 0 ? "No products yet" : "No products found"}
              description={
                listings.length === 0
                  ? "Add your first product so clients can book a specific property, vehicle, or item."
                  : "Try clearing filters or create a new product."
              }
            />
          ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredListings.map((listing) => (
              <Card key={listing.id}>
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Box className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{listing.name}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{listing.description || "No description"}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditTab(listing.id)}>
                      <Edit className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(listing.id)}
                      loading={deletingId === listing.id}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {listing.image_urls[0] && (
                    <div className="h-36 overflow-hidden rounded-lg border border-border bg-muted/20 p-2">
                      <img
                        src={resolveMediaUrl(listing.image_urls[0])}
                        alt={listing.name}
                        className="h-full w-full rounded-md object-contain"
                      />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-accent px-2 py-1 text-accent-foreground">
                      {LISTING_STATUS_LABELS[listing.status]}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                      {listing.active ? "Active" : "Inactive"}
                    </span>
                    <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">
                      {listing.service_ids.length} linked service{listing.service_ids.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )}
        </TabsContent>

        <TabsContent value="inspection">
          <Card className="mb-4">
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant={inspectionFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInspectionFilter("all")}
                >
                  All
                </Button>
                <Button
                  type="button"
                  variant={inspectionFilter === "needs_attention" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInspectionFilter("needs_attention")}
                >
                  Needs attention
                </Button>
                <Button
                  type="button"
                  variant={inspectionFilter === "ready" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setInspectionFilter("ready")}
                >
                  Ready
                </Button>
              </div>
            </CardContent>
          </Card>
          {filteredInspectionRows.length === 0 ? (
            <EmptyState
              icon={Box}
              title="No products match this inspection filter"
              description="Clear the filter or finish product details so listings can go public."
            />
          ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {filteredInspectionRows.map((row) => (
              <Card key={row.listing.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    {row.readyForPublic ? (
                      <BadgeCheck className="h-5 w-5 text-primary" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-[var(--warning-on-surface)]" />
                    )}
                    {row.listing.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Inspection completion</span>
                    <span className="font-medium">{row.inspectionScore}/3</span>
                  </div>
                  <div className="space-y-2">
                    <p className="flex items-center gap-2">
                      {row.hasImage ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-[var(--warning-on-surface)]" />
                      )}
                      Product image uploaded
                    </p>
                    <p className="flex items-center gap-2">
                      {row.hasDescription ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-[var(--warning-on-surface)]" />
                      )}
                      Description/inspection notes completed
                    </p>
                    <p className="flex items-center gap-2">
                      {row.linkedServices.length > 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-[var(--warning-on-surface)]" />
                      )}
                      Linked to at least one service
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/40 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Linked services</p>
                    <p className="mt-1">
                      {row.linkedServices.length > 0 ? row.linkedServices.join(", ") : "No service linked yet"}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-card p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Public booking visibility</p>
                    <p className="mt-1 font-medium">
                      {row.readyForPublic ? "Ready for customer selection" : "Needs attention before publishing"}
                    </p>
                  </div>
                  {!row.readyForPublic && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        openEditTab(row.listing.id);
                        setActiveTab("create");
                      }}
                    >
                      Fix this product
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
