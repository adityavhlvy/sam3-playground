import Link from "next/link";
import { ArrowRight, Activity, Brain, Database, FileText } from "lucide-react";

export default function Home() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="hero min-h-[40vh] bg-base-200 rounded-box shadow-xl overflow-hidden relative">
        <div className="hero-overlay bg-opacity-60 bg-gradient-to-r from-primary/20 to-secondary/20"></div>
        <div className="hero-content text-center text-neutral-content relative z-10">
          <div className="max-w-md">
            <h1 className="mb-5 text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">SAM 3 Concept</h1>
            <p className="mb-5 font-medium text-lg">
              Segment Anything Model 3 Interactive Dashboard. Train, fine-tune, and verify your geospatial datasets with advanced AI.
            </p>
            <Link href="/inference" className="btn btn-primary btn-lg shadow-lg hover:shadow-primary/50 transition-all border-none">
              Start Inference <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Card 1 */}
        <div className="card bg-base-100 shadow-xl border border-base-content/5 hover:border-primary/50 transition-all hover:scale-[1.02]">
          <div className="card-body">
            <div className="flex items-center gap-3 mb-2 text-secondary">
              <Activity className="w-8 h-8" />
              <h2 className="card-title">Training Management</h2>
            </div>
            <p className="text-base-content/70">Configure and monitor training sessions. Visualize loss and accuracy metrics in real-time.</p>
            <div className="card-actions justify-end mt-4">
              <Link href="/train" className="btn btn-sm btn-ghost">Go to Training</Link>
            </div>
          </div>
        </div>

        {/* Card 2 */}
        <div className="card bg-base-100 shadow-xl border border-base-content/5 hover:border-accent/50 transition-all hover:scale-[1.02]">
          <div className="card-body">
            <div className="flex items-center gap-3 mb-2 text-accent">
              <Database className="w-8 h-8" />
              <h2 className="card-title">Data Engine</h2>
            </div>
            <p className="text-base-content/70">Verify and annotate data using the SAM3 Data Engine pipeline (Phase 1-4). Video supported.</p>
            <div className="card-actions justify-end mt-4">
              <Link href="/data-engine" className="btn btn-sm btn-ghost">Go to Engine</Link>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="card bg-base-100 shadow-xl border border-base-content/5 hover:border-primary/50 transition-all hover:scale-[1.02]">
          <div className="card-body">
            <div className="flex items-center gap-3 mb-2 text-primary">
              <Brain className="w-8 h-8" />
              <h2 className="card-title">Inference & Tests</h2>
            </div>
            <p className="text-base-content/70">Run inference on images and videos. Interactive visual prompt correction.</p>
            <div className="card-actions justify-end mt-4">
              <Link href="/inference" className="btn btn-sm btn-ghost">Run Model</Link>
            </div>
          </div>
        </div>

        {/* Card 4 - New Dataset Manager */}
        <div className="card bg-base-100 shadow-xl border border-base-content/5 hover:border-info/50 transition-all hover:scale-[1.02]">
          <div className="card-body">
            <div className="flex items-center gap-3 mb-2 text-info">
              <FileText className="w-8 h-8" />
              <h2 className="card-title">Dataset Manager</h2>
            </div>
            <p className="text-base-content/70">Upload custom datasets and automatically generate SAM 3 training configurations.</p>
            <div className="card-actions justify-end mt-4">
              <Link href="/dataset" className="btn btn-sm btn-ghost">Manage Data</Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card bg-base-100 shadow-md border border-base-300">
        <div className="card-body">
          <h3 className="font-bold text-lg flex items-center gap-2"><FileText className="w-5 h-5" /> Recent Activity</h3>
          <div className="overflow-x-auto">
            {/* Example Table structure for future real data integration
            <table className="table table-zebra">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>#TR-8821</td>
                  <td>Training (Fine-tune)</td>
                  <td><span className="badge badge-success">Completed</span></td>
                  <td>2 hours ago</td>
                </tr>
                <tr>
                  <td>#DE-102</td>
                  <td>Data Verification</td>
                  <td><span className="badge badge-warning">In Progress</span></td>
                  <td>Just now</td>
                </tr>
              </tbody>
            </table>
            */}
            <div className="text-center py-8 opacity-50 italic">
              No recent activity found. (Real-time tracking not yet connected)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
