import {ReportPage} from '@/components/report-pages';
import type {ReportQuery} from '@/lib/report-analysis';
export default function Page({searchParams}:{searchParams:Promise<ReportQuery>}){return <ReportPage tab="sales" searchParams={searchParams}/>;}
