import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogResultBadge } from "@/components/StatusBadge";
import { TablePagination, usePagination } from "@/components/TablePagination";
import { mockLogs } from "@/lib/mock-data";
import { Search, ScrollText } from "lucide-react";

const LogsPage = () => {
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState("all");

  const filtered = mockLogs.filter(log => {
    const matchSearch = !search ||
      log.title.toLowerCase().includes(search.toLowerCase()) ||
      log.streamKey.toLowerCase().includes(search.toLowerCase());
    const matchResult = resultFilter === "all" || log.result === resultFilter;
    return matchSearch && matchResult;
  });

  const {
    paginatedItems,
    currentPage,
    pageSize,
    totalItems,
    setCurrentPage,
    handlePageSizeChange,
  } = usePagination(filtered, 10);

  return (
    <DashboardLayout>
      <div className="p-6 lg:p-8 max-w-full animate-fade-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Sync Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">History of all sync operations</p>
        </div>

        <Card className="p-4 mb-4 bg-card border border-border">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search logs..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} className="pl-9 h-9 w-64" />
            </div>
            <Select value={resultFilter} onValueChange={(v) => { setResultFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Filter result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="updated">Updated</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="bg-card border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Date/Time</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Stream Key</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Title</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Action</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">Result</th>
                  <th className="text-left p-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Details</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-muted-foreground">
                      <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p>No logs found</p>
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map(log => (
                    <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{log.timestamp}</td>
                      <td className="p-3 font-mono font-medium text-foreground">{log.streamKey}</td>
                      <td className="p-3 font-medium text-foreground">{log.title}</td>
                      <td className="p-3 text-muted-foreground">{log.action}</td>
                      <td className="p-3"><LogResultBadge result={log.result} /></td>
                      <td className="p-3 text-xs text-muted-foreground max-w-xs truncate hidden lg:table-cell" title={log.details}>{log.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default LogsPage;
