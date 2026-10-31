import './globals.css';
export const metadata={title:'Monky’s Store ERP',description:'Inventario, ventas y pedidos'};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="es"><body>{children}</body></html>;
}
