import { Component, ElementRef, HostListener, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-navbar',
  imports: [CommonModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css'
})
export class NavbarComponent {
 showMenu = signal(false);

  @ViewChild('menuRef') menuRef!: ElementRef;

  toggleMenu() {
    this.showMenu.set(!this.showMenu());
  }

  @HostListener('document:click', ['$event'])
  onClickOutside(event: MouseEvent){
    const target = event.target as HTMLElement;
    if (this.menuRef && !this.menuRef.nativeElement.contains(target)){
      this.showMenu.set(false);
    }
  }

  logout() {
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
}
