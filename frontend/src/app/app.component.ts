import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './shared/components/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <app-navbar />
    <main class="app-content">
      <router-outlet />
    </main>
  `,
  styles: [`
    .app-content {
      min-height: calc(100vh - 64px);
      background-color: #F4F8F2;
    }
  `],
})
export class AppComponent {}
