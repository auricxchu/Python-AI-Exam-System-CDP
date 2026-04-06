let teacherSessionPassword = "";

export const teacherSessionService = {
  remember(password: string) {
    teacherSessionPassword = password;
  },

  getPassword(): string {
    return teacherSessionPassword;
  },

  clear() {
    teacherSessionPassword = "";
  }
};
